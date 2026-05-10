import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.util.concurrent.Executors;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

public class TetrisServer {

    private static final long ROOM_TTL_MS = 24L * 60 * 60 * 1000;
    private static final Pattern SLUG_RE = Pattern.compile("^[a-z0-9-]{3,50}$");
    private static final ConcurrentHashMap<String, Room> rooms = new ConcurrentHashMap<>();

    private static final String[] ADJ = {"happy","blue","red","fast","quiet","brave","silly","wise","calm","fierce","tiny","big","gold","silver","lucky","wild","sleepy","sunny","misty","royal","jolly","clever","mighty","gentle","cosmic","electric","velvet","crimson","golden","silent"};
    private static final String[] NOUN = {"fox","bear","wolf","eagle","tiger","dragon","cat","panda","whale","owl","raven","lion","seal","deer","hawk","koala","otter","mouse","frog","duck","pixel","bishop","rook","comet","nova","echo","crane","fern","ember","quartz"};

    static class Room {
        volatile String state;
        final CopyOnWriteArrayList<OutputStream> sseClients = new CopyOnWriteArrayList<>();
        final AtomicLong lastActivity = new AtomicLong(System.currentTimeMillis());
        void touch() { lastActivity.set(System.currentTimeMillis()); }
    }

    private static final Path SESSIONS_DIR = Path.of("sessions");
    private static final Path ROOMS_DIR = SESSIONS_DIR.resolve("rooms");
    private static final Path CAREERS_DIR = SESSIONS_DIR.resolve("careers");
    private static Path roomFile(String slug) { return ROOMS_DIR.resolve(slug + ".json"); }
    private static Path careerFile(String uid) { return CAREERS_DIR.resolve(uid + ".json"); }

    private static void persistRoom(String slug, String state) {
        try {
            Files.createDirectories(ROOMS_DIR);
            Files.writeString(roomFile(slug), state,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (Exception ignored) {}
    }

    private static void deleteRoomFile(String slug) {
        try { Files.deleteIfExists(roomFile(slug)); } catch (Exception ignored) {}
    }

    private static String slugify(String raw) {
        if (raw == null) return null;
        String s = raw.toLowerCase().trim()
            .replaceAll("[^a-z0-9-]+", "-")
            .replaceAll("-+", "-")
            .replaceAll("^-+|-+$", "");
        return SLUG_RE.matcher(s).matches() ? s : null;
    }

    private static String autoSlug() {
        var rnd = ThreadLocalRandom.current();
        for (int i = 0; i < 50; i++) {
            String s = ADJ[rnd.nextInt(ADJ.length)] + "-" + NOUN[rnd.nextInt(NOUN.length)] + "-" + (rnd.nextInt(90) + 10);
            if (!rooms.containsKey(s)) return s;
        }
        return "room-" + System.currentTimeMillis() % 100000;
    }

    private static String queryParam(URI uri, String name) {
        String q = uri.getRawQuery();
        if (q == null) return null;
        for (String p : q.split("&")) {
            int eq = p.indexOf('=');
            if (eq > 0 && p.substring(0, eq).equals(name)) {
                return URLDecoder.decode(p.substring(eq + 1), StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static String jsonString(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') sb.append('\\').append(c);
            else if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
            else sb.append(c);
        }
        return sb.append('"').toString();
    }

    private static final Path PUBLIC_DIR = Path.of("public");

    private static String readStaticFile(String filename) {
        try {
            return Files.readString(PUBLIC_DIR.resolve(filename));
        } catch (Exception e) {
            return null;
        }
    }

    private static String etagFor(byte[] data) {
        long h = 1469598103934665603L;
        for (byte b : data) { h ^= b & 0xff; h *= 1099511628211L; }
        return "\"" + Long.toHexString(h) + "\"";
    }

    private static void serveStatic(HttpExchange exchange, String filename, String contentType) throws IOException {
        String content = readStaticFile(filename);
        if (content == null) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        byte[] response = content.getBytes(StandardCharsets.UTF_8);
        String etag = etagFor(response);
        String inm = exchange.getRequestHeaders().getFirst("If-None-Match");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache, must-revalidate");
        exchange.getResponseHeaders().set("ETag", etag);
        if (etag.equals(inm)) {
            exchange.sendResponseHeaders(304, -1);
            return;
        }
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(200, response.length);
        try (var os = exchange.getResponseBody()) {
            os.write(response);
        }
    }

    private static String currentVersion() {
        try { return Files.readString(Path.of("version.txt")).trim().replaceAll("[^a-zA-Z0-9._-]", ""); }
        catch (Exception e) { return "dev"; }
    }

    private static void handleRoot(HttpExchange exchange) throws IOException {
        String html = readStaticFile("index.html");
        if (html == null) {
            html = HTML_CONTENT;
        }
        String v = currentVersion();
        html = html.replace("src=\"app.js\"", "src=\"app.js?v=" + v + "\"")
                   .replace("href=\"style.css\"", "href=\"style.css?v=" + v + "\"");
        byte[] response = html.getBytes(StandardCharsets.UTF_8);
        String etag = etagFor(response);
        String inm = exchange.getRequestHeaders().getFirst("If-None-Match");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache, must-revalidate");
        exchange.getResponseHeaders().set("ETag", etag);
        if (etag.equals(inm)) {
            exchange.sendResponseHeaders(304, -1);
            return;
        }
        exchange.getResponseHeaders().set("Content-Type", "text/html; charset=UTF-8");
        exchange.sendResponseHeaders(200, response.length);
        try (var os = exchange.getResponseBody()) {
            os.write(response);
        }
    }

    private static void handleEvents(HttpExchange exchange) throws IOException {
        String slug = queryParam(exchange.getRequestURI(), "room");
        if (slug == null || !SLUG_RE.matcher(slug).matches()) {
            exchange.sendResponseHeaders(400, -1);
            return;
        }
        Room room = rooms.get(slug);
        if (room == null) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache");
        exchange.getResponseHeaders().set("Connection", "keep-alive");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, 0);

        OutputStream os = exchange.getResponseBody();
        room.sseClients.add(os);
        room.touch();

        try {
            if (room.state != null) {
                os.write(("data: " + room.state + "\n\n").getBytes(StandardCharsets.UTF_8));
                os.flush();
            }
            while (!Thread.currentThread().isInterrupted()) {
                Thread.sleep(15000);
                os.write(":\n\n".getBytes(StandardCharsets.UTF_8));
                os.flush();
            }
        } catch (Exception e) {
            // Client disconnected
        } finally {
            room.sseClients.remove(os);
            try { os.close(); } catch (Exception ignored) {}
        }
    }

    private static void handleAction(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        if ("POST".equals(exchange.getRequestMethod())) {
            String slug = queryParam(exchange.getRequestURI(), "room");
            if (slug == null || !SLUG_RE.matcher(slug).matches()) {
                exchange.sendResponseHeaders(400, -1);
                return;
            }
            Room room = rooms.get(slug);
            if (room == null) {
                exchange.sendResponseHeaders(404, -1);
                return;
            }
            try (InputStream is = exchange.getRequestBody()) {
                String body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                if (body.length() > 200_000) {
                    exchange.sendResponseHeaders(413, -1);
                    return;
                }
                room.state = body;
                room.touch();
                persistRoom(slug, body);
                broadcastRoom(room, body);
            }
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, -1);
        } else {
            exchange.sendResponseHeaders(405, -1);
        }
    }

    private static void handleRoomCreate(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        if ("OPTIONS".equals(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
            exchange.sendResponseHeaders(204, -1);
            return;
        }
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        String body;
        try (InputStream is = exchange.getRequestBody()) {
            body = new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
        String desired = null;
        int idx = body.indexOf("\"name\"");
        if (idx >= 0) {
            int q1 = body.indexOf('"', body.indexOf(':', idx) + 1);
            int q2 = q1 >= 0 ? body.indexOf('"', q1 + 1) : -1;
            if (q1 >= 0 && q2 > q1) desired = body.substring(q1 + 1, q2);
        }
        String slug;
        if (desired != null && !desired.isBlank()) {
            slug = slugify(desired);
            if (slug == null) {
                exchange.sendResponseHeaders(400, -1);
                return;
            }
            if (rooms.containsKey(slug)) {
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                String json = "{\"slug\":" + jsonString(slug) + ",\"existed\":true}";
                byte[] data = json.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, data.length);
                try (var os = exchange.getResponseBody()) { os.write(data); }
                return;
            }
        } else {
            slug = autoSlug();
        }
        rooms.computeIfAbsent(slug, k -> new Room());
        String json = "{\"slug\":" + jsonString(slug) + ",\"existed\":false}";
        byte[] data = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, data.length);
        try (var os = exchange.getResponseBody()) { os.write(data); }
    }

    private static void handleRoomGet(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        String path = exchange.getRequestURI().getPath();
        String slug = path.substring("/room/".length());
        if (!SLUG_RE.matcher(slug).matches()) {
            exchange.sendResponseHeaders(400, -1);
            return;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        Room room = rooms.get(slug);
        if (room == null) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        room.touch();
        String state = room.state != null ? room.state : "null";
        byte[] data = state.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, data.length);
        try (var os = exchange.getResponseBody()) { os.write(data); }
    }

    private static void broadcastRoom(Room room, String state) {
        byte[] data = ("data: " + state + "\n\n").getBytes(StandardCharsets.UTF_8);
        for (OutputStream os : room.sseClients) {
            try { os.write(data); os.flush(); }
            catch (Exception e) { room.sseClients.remove(os); }
        }
    }

    private static void sweepStaleRooms() {
        long cutoff = System.currentTimeMillis() - ROOM_TTL_MS;
        for (var entry : rooms.entrySet()) {
            Room r = entry.getValue();
            if (r.lastActivity.get() < cutoff && r.sseClients.isEmpty()) {
                rooms.remove(entry.getKey());
                deleteRoomFile(entry.getKey());
            }
        }
    }

    private static void migrateLegacyRoomFiles() {
        try {
            Files.createDirectories(ROOMS_DIR);
            Files.createDirectories(CAREERS_DIR);
        } catch (Exception ignored) {}
        // 1) Old layout: ./room_<slug>.json -> ./sessions/rooms/<slug>.json
        try (Stream<Path> paths = Files.list(Path.of("."))) {
            paths.filter(p -> {
                String n = p.getFileName().toString();
                return n.startsWith("room_") && n.endsWith(".json") && Files.isRegularFile(p);
            }).forEach(p -> {
                String name = p.getFileName().toString();
                String slug = name.substring(5, name.length() - 5);
                if (!SLUG_RE.matcher(slug).matches()) return;
                Path target = roomFile(slug);
                try {
                    if (!Files.exists(target)) Files.move(p, target);
                    else Files.deleteIfExists(p);
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
        // 2) Intermediate layout: ./rooms/<slug>.json -> ./sessions/rooms/<slug>.json
        Path oldRoomsDir = Path.of("rooms");
        if (Files.isDirectory(oldRoomsDir)) {
            try (Stream<Path> paths = Files.list(oldRoomsDir)) {
                paths.filter(p -> p.getFileName().toString().endsWith(".json")).forEach(p -> {
                    Path target = ROOMS_DIR.resolve(p.getFileName());
                    try {
                        if (!Files.exists(target)) Files.move(p, target);
                        else Files.deleteIfExists(p);
                    } catch (Exception ignored) {}
                });
            } catch (Exception ignored) {}
            try { Files.deleteIfExists(oldRoomsDir); } catch (Exception ignored) {}
        }
        // 3) Old career layout: ./career_<uid>.json -> ./sessions/careers/<uid>.json
        try (Stream<Path> paths = Files.list(Path.of("."))) {
            paths.filter(p -> {
                String n = p.getFileName().toString();
                return n.startsWith("career_") && n.endsWith(".json") && Files.isRegularFile(p);
            }).forEach(p -> {
                String name = p.getFileName().toString();
                String uid = name.substring(7, name.length() - 5);
                if (!uid.matches("^[a-zA-Z0-9_-]{1,64}$")) return;
                Path target = careerFile(uid);
                try {
                    if (!Files.exists(target)) Files.move(p, target);
                    else Files.deleteIfExists(p);
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

    private static void loadRoomsFromDisk() {
        try {
            Files.createDirectories(ROOMS_DIR);
        } catch (Exception ignored) {}
        try (Stream<Path> paths = Files.list(ROOMS_DIR)) {
            paths.filter(p -> p.getFileName().toString().endsWith(".json")).forEach(p -> {
                String name = p.getFileName().toString();
                String slug = name.substring(0, name.length() - 5);
                if (!SLUG_RE.matcher(slug).matches()) return;
                try {
                    String state = Files.readString(p);
                    Room r = new Room();
                    r.state = state;
                    rooms.put(slug, r);
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

    private static void migrateLegacyState() {
        Path legacy = Path.of("gamestate.json");
        if (!Files.exists(legacy)) return;
        String slug = "gabriel-ana";
        Path target = roomFile(slug);
        try {
            Files.createDirectories(ROOMS_DIR);
            if (!Files.exists(target)) {
                Files.copy(legacy, target);
            }
            if (!rooms.containsKey(slug)) {
                Room r = new Room();
                r.state = Files.readString(target);
                rooms.put(slug, r);
            }
        } catch (Exception ignored) {}
    }

    private static void handleCareer(HttpExchange exchange) throws IOException {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        String method = exchange.getRequestMethod();

        if ("OPTIONS".equals(method)) {
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
            exchange.sendResponseHeaders(204, -1);
            return;
        }

        String path = exchange.getRequestURI().getPath();
        String uid = path.substring("/career/".length());
        if (!uid.matches("^[a-zA-Z0-9_-]{1,64}$")) {
            exchange.sendResponseHeaders(400, -1);
            return;
        }

        try { Files.createDirectories(CAREERS_DIR); } catch (Exception ignored) {}
        Path file = careerFile(uid);
        if ("GET".equals(method)) {
            if (Files.exists(file)) {
                byte[] data = Files.readAllBytes(file);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, data.length);
                try (var os = exchange.getResponseBody()) { os.write(data); }
            } else {
                exchange.sendResponseHeaders(404, -1);
            }
            return;
        }

        if ("POST".equals(method)) {
            try (InputStream is = exchange.getRequestBody()) {
                byte[] body = is.readAllBytes();
                if (body.length > 100_000) {
                    exchange.sendResponseHeaders(413, -1);
                    return;
                }
                Files.write(file, body, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            }
            exchange.sendResponseHeaders(200, -1);
            return;
        }

        exchange.sendResponseHeaders(405, -1);
    }

    private static void handleVersion(HttpExchange exchange) throws IOException {
        String version = "unknown";
        try {
            version = Files.readString(Path.of("version.txt")).trim();
        } catch (Exception ignored) {}
        String json = "{\"version\":\"" + version + "\"}";
        byte[] response = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, response.length);
        try (var os = exchange.getResponseBody()) {
            os.write(response);
        }
    }

    public static void main(String[] args) throws Exception {
        migrateLegacyRoomFiles();
        loadRoomsFromDisk();
        migrateLegacyState();

        var server = HttpServer.create(new InetSocketAddress(3001), 0);

        // 1. Rota Frontend (Single Page Application)
        server.createContext("/", TetrisServer::handleRoot);
        server.createContext("/style.css", exchange -> serveStatic(exchange, "style.css", "text/css"));
        server.createContext("/app.js", exchange -> serveStatic(exchange, "app.js", "application/javascript"));

        server.createContext("/events", TetrisServer::handleEvents);
        server.createContext("/action", TetrisServer::handleAction);
        server.createContext("/room/create", TetrisServer::handleRoomCreate);
        server.createContext("/room/", TetrisServer::handleRoomGet);

        server.createContext("/career/", TetrisServer::handleCareer);
        server.createContext("/version", TetrisServer::handleVersion);

        // Delega a concorrência para as Virtual Threads (Project Loom)
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();

        ScheduledExecutorService sweeper = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "room-ttl-sweeper");
            t.setDaemon(true);
            return t;
        });
        sweeper.scheduleAtFixedRate(TetrisServer::sweepStaleRooms, 1, 60, TimeUnit.MINUTES);

        System.out.println("\n=======================================================");
        System.out.println("🚀 TETRIS CO-OP SERVER (NATIVO)");
        System.out.println("⚡ Engine: Java Virtual Threads + Server-Sent Events");
        System.out.println("📦 Zero Dependências externas (Sem Jbang/Javalin)");
        System.out.println("🏠 Salas carregadas: " + rooms.size());
        System.out.println("🔗 Host Local: http://localhost:3001");
        System.out.println("=======================================================\n");
    }

    // ====================================================================================
    // FRONTEND: React Application
    // ====================================================================================
    private static final String HTML_PART_1 = """
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>Tetris Co-op (Zero Deps)</title>
            <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body { overflow: hidden; touch-action: none; background-color: #030712; }
                .block-texture { box-shadow: inset 2px 2px 5px rgba(255,255,255,0.4), inset -3px -3px 8px rgba(0,0,0,0.6); }
                @keyframes popIn { 0% { transform: scale(0.7); opacity: 0; filter: brightness(2); } 60% { transform: scale(1.05); filter: brightness(1.2); } 100% { transform: scale(1); opacity: 1; filter: brightness(1); } }
                .animate-popIn { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
                @keyframes dissolve { 0% { transform: scale(1); filter: brightness(1); opacity: 1; border-radius: 4px; } 30% { transform: scale(1.15); filter: brightness(2) contrast(1.5); opacity: 1; box-shadow: 0 0 30px rgba(255,255,255,1); z-index: 10; } 100% { transform: scale(0.5); filter: brightness(3) blur(10px); opacity: 0; border-radius: 50%; } }
                .animate-dissolve { animation: dissolve 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
                @keyframes floatUp { 0% { transform: translateY(0) scale(0.8); opacity: 0; } 20% { transform: translateY(-10px) scale(1.2); opacity: 1; } 100% { transform: translateY(-40px) scale(1); opacity: 0; } }
                .animate-floatUp { animation: floatUp 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes shimmer-gold { 0%,100% { filter: brightness(1.1) saturate(1.3); } 50% { filter: brightness(1.8) saturate(2) hue-rotate(15deg); } }
                .animate-shimmer { animation: shimmer-gold 1.1s ease-in-out infinite; }
                @keyframes bomb-pulse { 0%,100% { filter: brightness(0.85) saturate(1.2); } 50% { filter: brightness(1.6) saturate(2) contrast(1.3); } }
                .animate-bomb-pulse { animation: bomb-pulse 0.65s ease-in-out infinite; }
                @keyframes line-burst { 0% { transform: scale(1); filter: brightness(1); opacity: 1; } 20% { transform: scale(1.2); filter: brightness(3) contrast(2); opacity: 1; box-shadow: 0 0 40px rgba(255,255,255,0.9); } 50% { transform: scale(1.1); filter: brightness(2.5) contrast(1.8); opacity: 0.8; } 100% { transform: scale(0.3); filter: brightness(4) blur(12px); opacity: 0; border-radius: 50%; } }
                .animate-line-burst { animation: line-burst 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards; }
                @keyframes board-shake { 0%,100% { transform: translateX(0); } 15% { transform: translateX(-3px) translateY(2px); } 30% { transform: translateX(3px) translateY(-1px); } 45% { transform: translateX(-2px) translateY(1px); } 60% { transform: translateX(2px) translateY(-2px); } 75% { transform: translateX(-1px); } }
                .animate-board-shake { animation: board-shake 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94); }

                /* ---- Block textures ---- */
                .block-render { position: relative; }
                .block-render[data-tex="candy"] {
                    background: radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.45) 0%, transparent 50%),
                                repeating-conic-gradient(var(--c-from) 0% 12%, var(--c-to) 12% 24%) !important;
                    box-shadow: inset 2px 2px 6px rgba(255,255,255,0.45), inset -2px -2px 6px rgba(0,0,0,0.4) !important;
                }
                .block-render[data-tex="stone"] {
                    background: radial-gradient(circle at 25% 25%, rgba(255,255,255,0.12) 0%, transparent 35%),
                                radial-gradient(circle at 75% 75%, rgba(0,0,0,0.2) 0%, transparent 35%),
                                repeating-linear-gradient(45deg, transparent 0px, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 3px),
                                linear-gradient(160deg, var(--c-from) 0%, var(--c-to) 100%) !important;
                    box-shadow: inset 1px 1px 3px rgba(255,255,255,0.25), inset -2px -2px 5px rgba(0,0,0,0.5) !important;
                }
                .block-render[data-tex="metal"] {
                    background: repeating-linear-gradient(0deg, transparent 0px, rgba(255,255,255,0.07) 1px, transparent 2px),
                                repeating-linear-gradient(90deg, transparent 0px, rgba(0,0,0,0.06) 1px, transparent 3px),
                                linear-gradient(180deg, var(--c-from) 0%, var(--c-to) 100%) !important;
                    box-shadow: inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.35) !important;
                }
                .block-render[data-tex="glass"] {
                    background: radial-gradient(ellipse at 35% 25%, rgba(255,255,255,0.5) 0%, transparent 50%),
                                linear-gradient(170deg, rgba(255,255,255,0.2) 0%, transparent 45%),
                                linear-gradient(to bottom right, rgba(255,255,255,0.06), rgba(255,255,255,0.02)),
                                linear-gradient(to bottom right, var(--c-from), var(--c-to)) !important;
                    background-blend-mode: screen, normal, normal, normal !important;
                    box-shadow: inset 1px 1px 4px rgba(255,255,255,0.35), inset -2px -2px 5px rgba(0,0,0,0.25) !important;
                    border: 1px solid rgba(255,255,255,0.15) !important;
                }

                @media (prefers-reduced-motion: reduce) {
                    .animate-popIn, .animate-dissolve, .animate-floatUp, .animate-shimmer, .animate-bomb-pulse, .animate-line-burst, .animate-board-shake {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.01ms !important;
                    }
                }
            </style>
        </head>
        <body>
            <div id="root"></div>
            
            <script type="text/babel">
                const { useState, useEffect, useRef, useCallback } = React;

                const BOARD_SIZE = 10;
                const PIECE_STYLES = ['from-red-400 to-red-600', 'from-blue-400 to-blue-600', 'from-green-400 to-green-600', 'from-yellow-400 to-yellow-600', 'from-purple-400 to-purple-600', 'from-pink-400 to-pink-600', 'from-cyan-400 to-cyan-600', 'from-orange-400 to-orange-600'];

                // SVGs inline
                const IconTrophy = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>;
                const IconLayers = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>;
                const IconMenu = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>;
                const IconX = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>;
                const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>;
                const IconLogOut = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>;
                const IconAlert = () => <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>;
                const IconFullscreen = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/></svg>;
                const IconExitFullscreen = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/><polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/></svg>;

                const vibrate = (pattern) => { if (navigator.vibrate) try { navigator.vibrate(pattern); } catch (e) {} };

                const COLOR_MAP = {
                    'from-red-400 to-red-600': ['#f87171', '#dc2626'],
                    'from-blue-400 to-blue-600': ['#60a5fa', '#2563eb'],
                    'from-green-400 to-green-600': ['#4ade80', '#16a34a'],
                    'from-yellow-400 to-yellow-600': ['#facc15', '#ca8a04'],
                    'from-purple-400 to-purple-600': ['#c084fc', '#9333ea'],
                    'from-pink-400 to-pink-600': ['#f472b6', '#db2777'],
                    'from-cyan-400 to-cyan-600': ['#22d3ee', '#0891b2'],
                    'from-orange-400 to-orange-600': ['#fb923c', '#ea580c'],
                    'from-blue-400 to-cyan-300': ['#60a5fa', '#67e8f9'],
                    'from-blue-600 to-cyan-500': ['#2563eb', '#06b6d4'],
                    'from-blue-600 to-cyan-700': ['#2563eb', '#0e7490'],
                    'from-emerald-600 to-teal-700': ['#059669', '#0f766e'],
                    'from-purple-600 to-pink-700': ['#9333ea', '#be185d'],
                    'from-gray-500 to-gray-600': ['#6b7280', '#4b5563'],
                };

                const Block = ({ cellData, isDissolving, noAnim, extraClass = '', staggerDelay = 0, burst = false }) => {
                    if (!cellData) return <div className={`w-full h-full rounded-[4px] bg-white/5 border border-white/5 ${extraClass}`} />;
                    const type = typeof cellData === 'object' ? cellData.type : null;
                    let animClass = noAnim ? '' : 'animate-popIn';
                    if (isDissolving) animClass = burst ? 'animate-line-burst' : 'animate-dissolve';
                    const delayStyle = staggerDelay > 0 ? { animationDelay: `${staggerDelay}ms` } : {};
                    if (type === 'filler') return (
                        <div className={`w-full h-full rounded-[4px] animate-shimmer ${animClass} ${extraClass}`}
                            style={{ background: 'linear-gradient(135deg,#ffe066,#ffb347,#ff80bf,#a78bfa,#67e8f9,#ffe066)', backgroundSize: '300% 300%', boxShadow: 'inset 2px 2px 4px rgba(255,255,200,0.7), inset -2px -2px 5px rgba(120,60,0,0.5)', ...delayStyle }} />
                    );
                    if (type === 'explosive') return (
                        <div className={`w-full h-full rounded-[4px] animate-bomb-pulse ${animClass} ${extraClass}`}
                            style={{ background: 'radial-gradient(circle at 42% 38%, #ff6a00 0%, #c0200a 45%, #1a0000 100%)', boxShadow: 'inset 1px 1px 4px rgba(255,160,0,0.6), inset -1px -1px 5px rgba(0,0,0,0.9)', ...delayStyle }} />
                    );
                    const colorClass = typeof cellData === 'string' ? cellData : cellData.color;
                    const texture = (typeof cellData === 'object' && cellData.texture) || 'default';
                    const colors = COLOR_MAP[colorClass] || ['#666', '#333'];
                    const texStyle = { '--c-from': colors[0], '--c-to': colors[1], ...delayStyle };
                    return <div data-tex={texture} className={`w-full h-full bg-gradient-to-br ${colorClass} block-texture block-render ${animClass} relative rounded-[4px] overflow-hidden ${extraClass}`} style={texStyle} />;
                };

                const PIECE_LIBRARY = [
                    // 4-block classics
                    [[0,0],[1,0],[2,0],[3,0]],              // I
                    [[0,0],[1,0],[0,1],[1,1]],              // O
                    [[0,0],[1,0],[2,0],[1,1]],              // T
                    [[0,0],[0,1],[0,2],[1,2]],              // L
                    [[1,0],[1,1],[0,2],[1,2]],              // J
                    [[1,0],[2,0],[0,1],[1,1]],              // S
                    [[0,0],[1,0],[1,1],[2,1]],              // Z
                    // 5-block
                    [[1,0],[0,1],[1,1],[2,1],[1,2]],        // + cross
                    [[0,0],[0,1],[0,2],[1,2],[2,2]],        // 3×3 L ┘
                    [[0,0],[1,0],[2,0],[2,1],[2,2]],        // 3×3 L └
                    [[0,0],[1,0],[2,0],[0,1],[0,2]],        // 3×3 L ┐
                    [[2,0],[2,1],[0,2],[1,2],[2,2]],        // 3×3 L ┌
                    [[0,0],[1,0],[2,0],[3,0],[0,1]],        // 4-wide L
                    [[0,0],[1,0],[2,0],[3,0],[3,1]],        // 4-wide J
                    [[0,0],[0,1],[0,2],[0,3],[1,3]],        // 4-tall L
                    [[1,0],[1,1],[1,2],[0,3],[1,3]],        // 4-tall J
                    [[0,0],[2,0],[0,1],[1,1],[2,1]],        // U (∪)
                    [[1,0],[1,1],[0,2],[1,2],[2,2]],        // T-down
                    [[0,0],[1,0],[2,0],[1,1],[1,2]],        // T-up
                    // 6-block
                    [[0,0],[0,1],[0,2],[0,3],[1,3],[2,3]],  // big L (3+3 arms)
                    [[2,0],[2,1],[2,2],[0,3],[1,3],[2,3]],  // big J (3+3 arms)
                    [[0,0],[1,0],[2,0],[3,0],[4,0],[2,1]],  // big T flat
                    [[0,0],[1,0],[2,0],[2,1],[3,1],[4,1]],  // Z-wide staircase
                    [[2,0],[3,0],[4,0],[0,1],[1,1],[2,1]],  // S-wide staircase
                    [[0,0],[1,0],[2,0],[0,1],[0,2],[0,3]],  // big corner ┐
                    [[0,0],[0,1],[0,2],[1,2],[2,2],[2,3]],  // S-step tall
                    // 7-block
                    [[0,0],[2,0],[0,1],[1,1],[2,1],[0,2],[2,2]], // H
                    [[0,0],[1,0],[2,0],[0,1],[0,2],[1,2],[2,2]], // C / ∪-big
                    [[0,0],[1,0],[2,0],[3,0],[0,1],[0,2],[0,3]], // 4+4 L corner
                    [[0,0],[1,0],[2,0],[3,0],[3,1],[3,2],[3,3]], // 4+4 J corner
                    // diagonal pieces
                    [[0,0],[1,1],[2,2]],                         // diagonal ↘ 3
                    [[2,0],[1,1],[0,2]],                         // diagonal ↙ 3
                    [[0,0],[1,1],[2,2],[3,3]],                   // diagonal ↘ 4
                    [[3,0],[2,1],[1,2],[0,3]],                   // diagonal ↙ 4
                    [[1,0],[0,1],[2,1],[1,2]],                   // diamond ◆
                    [[0,0],[1,0],[1,1],[2,2],[3,2]],             // S-diagonal
                    [[0,2],[1,2],[1,1],[2,0],[3,0]],             // Z-diagonal
                    [[0,0],[1,1],[2,2],[2,3],[3,3]],             // diagonal + L foot
                    [[0,0],[1,0],[1,1],[2,1],[2,2]],             // staircase ↘
                    [[0,2],[1,2],[1,1],[2,1],[2,0]],             // staircase ↗
                ];

                const DIAGONAL_OFFSET = PIECE_LIBRARY.length - 10; // last 10 are diagonal pieces

                const generateProceduralPiece = (level, mods = {}) => {
                    const cap = mods.maxBlocks ?? Math.min(7, 5 + Math.floor(level / 2));
                    const minB = mods.minBlocks ?? 0;
                    let pool = mods.onlyDiagonal ? PIECE_LIBRARY.slice(DIAGONAL_OFFSET) : PIECE_LIBRARY;
                    pool = pool.filter(p => p.length <= cap && p.length >= minB);
                    if (pool.length === 0) pool = PIECE_LIBRARY.filter(p => p.length <= cap);
                    const shape = pool[Math.floor(Math.random() * pool.length)];
                    let texture = 'default';
                    if (mods.textureMode === 'random') {
                        const textures = ['candy', 'stone', 'metal', 'glass'];
                        texture = textures[Math.floor(Math.random() * textures.length)];
                    } else if (mods.textureMode) {
                        texture = mods.textureMode;
                    }
                    return { blocks: shape.map(([x, y]) => ({ x, y })), color: PIECE_STYLES[Math.floor(Math.random() * PIECE_STYLES.length)], texture };
                };

                const generateInventory = (level, mods = {}) => {
                    const makeSlot = (forceType) => {
                        if (forceType === 'explosive') return { blocks: { blocks: [{ x: 0, y: 0 }], type: 'explosive' } };
                        if (forceType === 'filler') return { blocks: { blocks: [{ x: 0, y: 0 }], type: 'filler' } };
                        if (mods.banSpecials) return { blocks: generateProceduralPiece(level, mods) };
                        const r = Math.random();
                        const fillerPct = mods.fillerPct ?? 0.08;
                        const explosivePct = mods.explosivePct ?? 0.07;
                        if (r < fillerPct) return { blocks: { blocks: [{ x: 0, y: 0 }], type: 'filler' } };
                        if (r < fillerPct + explosivePct) return { blocks: { blocks: [{ x: 0, y: 0 }], type: 'explosive' } };
                        return { blocks: generateProceduralPiece(level, mods) };
                    };
                    if (mods.forceExplosives) return [makeSlot('explosive'), makeSlot(), makeSlot()];
                    return [makeSlot(), makeSlot(), makeSlot()];
                };

                const getBoardSize = (board) => Math.round(Math.sqrt(board.length)) || BOARD_SIZE;

                const generateComplexInitialBoard = (size = BOARD_SIZE, density = 0.05) => {
                    let newBoard = Array(size * size).fill(0);
                    const targetCells = Math.floor(size * size * density);
                    let attempts = 0;
                    while (newBoard.filter(v => v !== 0).length < targetCells && attempts < 200) {
                        const piece = generateProceduralPiece(2);
                        const startX = Math.floor(Math.random() * size); const startY = Math.floor(Math.random() * size);
                        let isValid = true;
                        for (const block of piece.blocks) {
                            const tX = startX + block.x; const tY = startY + block.y;
                            if (tX < 0 || tX >= size || tY < 0 || tY >= size || newBoard[tY * size + tX] !== 0) { isValid = false; break; }
                        }
                        if (isValid) for (const block of piece.blocks) newBoard[(startY + block.y) * size + (startX + block.x)] = { color: 'from-gray-500 to-gray-600 grayscale-[20%]' };
                        attempts++;
                    }
                    return newBoard;
                };

                const canPlacePiece = (board, piece) => {
                    if (!piece || !piece.blocks || !piece.blocks.blocks) return false;
                    const size = getBoardSize(board);
                    if (piece.blocks.type === 'explosive') return true;
                    for (let gridY = 0; gridY < size; gridY++) {
                        for (let gridX = 0; gridX < size; gridX++) {
                            let isValid = true;
                            for (const block of piece.blocks.blocks) {
                                const tX = gridX + block.x; const tY = gridY + block.y;
                                if (tX < 0 || tX >= size || tY < 0 || tY >= size || board[tY * size + tX] !== 0) { isValid = false; break; }
                            }
                            if (isValid) return true;
                        }
                    }
                    return false;
                };

                const CAREER_STAGES = [
                    { id: 1, name: 'Aquecimento', hint: 'Comece simples', density: 0, objective: { type: 'score', target: 200 }, modifiers: { maxBlocks: 4, banSpecials: true }, stars: [200, 400, 700] },
                    { id: 2, name: 'Limpeza Básica', hint: 'Limpe linhas no campo', density: 0.3, objective: { type: 'lines', target: 5 }, modifiers: { maxBlocks: 4 }, stars: [5, 8, 12] },
                    { id: 3, name: 'Sobrevivência', hint: 'Coloque sem perder', density: 0, objective: { type: 'pieces', target: 20 }, modifiers: { maxBlocks: 5, banSpecials: true }, stars: [20, 30, 40] },
                    { id: 4, name: 'Pressão', hint: 'Pontue sob pressão', density: 0.4, objective: { type: 'score', target: 800 }, modifiers: { maxBlocks: 5 }, stars: [800, 1200, 1800] },
                    { id: 5, name: 'Demolição', hint: 'Use explosivos com sabedoria', density: 0.5, objective: { type: 'score', target: 600 }, modifiers: { forceExplosives: true, explosivePct: 0.2 }, stars: [600, 1000, 1500] },
                    { id: 6, name: 'Sem Apoio', hint: 'Pontue sem especiais', density: 0.3, objective: { type: 'score', target: 1500 }, modifiers: { banSpecials: true }, stars: [1500, 2200, 3000] },
                    { id: 7, name: 'Diagonal', hint: 'Apenas peças diagonais', density: 0.2, objective: { type: 'score', target: 600 }, modifiers: { onlyDiagonal: true }, stars: [600, 1000, 1500] },
                    { id: 8, name: 'Apertado', hint: 'Espaço escasso', density: 0.6, objective: { type: 'lines', target: 4 }, modifiers: {}, stars: [4, 7, 10] },
                    { id: 9, name: 'Maratona', hint: 'Pontuação alta', density: 0.2, objective: { type: 'score', target: 3000 }, modifiers: {}, stars: [3000, 5000, 7000] },
                    { id: 10, name: 'Complexo', hint: 'Apenas peças grandes', density: 0.1, objective: { type: 'score', target: 1000 }, modifiers: { maxBlocks: 7, minBlocks: 6 }, stars: [1000, 1500, 2200] },
                    { id: 11, name: 'Mestre Limpador', hint: 'Combos de linhas', density: 0.4, objective: { type: 'lines', target: 15 }, modifiers: {}, stars: [15, 25, 40] },
                    { id: 12, name: 'Bombardeio', hint: 'Tabuleiro pré-preenchido', density: 0.5, objective: { type: 'score', target: 2000 }, modifiers: {}, stars: [2000, 3000, 4500] },
                    { id: 13, name: 'Vidente', hint: 'Sem especiais, espaço apertado', density: 0.55, objective: { type: 'pieces', target: 30 }, modifiers: { banSpecials: true }, stars: [30, 50, 80] },
                    { id: 14, name: 'Velocista', hint: 'Aumente os pontos rápido', density: 0.3, objective: { type: 'score', target: 5000 }, modifiers: {}, stars: [5000, 7500, 10000] },
                    { id: 15, name: 'Diagonal+', hint: 'Diagonais sob densidade', density: 0.4, objective: { type: 'score', target: 1200 }, modifiers: { onlyDiagonal: true }, stars: [1200, 1800, 2500] },
                    { id: 16, name: 'Eco', hint: 'Sobreviva a muitas peças', density: 0.4, objective: { type: 'pieces', target: 50 }, modifiers: { banSpecials: true }, stars: [50, 80, 120] },
                    { id: 17, name: 'Inferno', hint: 'Tabuleiro hostil', density: 0.65, objective: { type: 'lines', target: 6 }, modifiers: {}, stars: [6, 10, 15] },
                    { id: 18, name: 'Mestre', hint: 'Tudo no máximo', density: 0.5, objective: { type: 'score', target: 8000 }, modifiers: {}, stars: [8000, 12000, 18000] },
                    { id: 19, name: 'Disciplina', hint: 'Sem especiais, denso', density: 0.6, objective: { type: 'score', target: 3000 }, modifiers: { banSpecials: true }, stars: [3000, 4500, 6500] },
                    { id: 20, name: 'Apocalipse', hint: 'O teste final', density: 0.7, objective: { type: 'score', target: 2000 }, modifiers: {}, stars: [2000, 3500, 5500] },
                ];

                const SOLO_DIFFICULTIES = {
                    entry:   { name: 'Iniciante', boardSize: 7, density: 0,    modifiers: { maxBlocks: 4, banSpecials: true } },
                    easy:    { name: 'Fácil',     boardSize: 10, density: 0,    modifiers: { maxBlocks: 5, fillerPct: 0.12, explosivePct: 0.10 } },
                    normal:  { name: 'Normal',    boardSize: 10, density: 0.1,  modifiers: {} },
                    hard:    { name: 'Difícil',   boardSize: 10, density: 0.3,  modifiers: { fillerPct: 0.04, explosivePct: 0.04 } },
                    extreme: { name: 'Extremo',   boardSize: 10, density: 0.5,  modifiers: { banSpecials: true } },
                };

                const computeStars = (stage, gs, pieces) => {
                    const v = stage.objective.type === 'score' ? gs.score : stage.objective.type === 'lines' ? gs.lines : pieces;
                    return stage.stars.filter(t => v >= t).length;
                };

                const checkGameOver = (board, mods = {}) => {
                    const size = getBoardSize(board);
                    let pool = mods.onlyDiagonal ? PIECE_LIBRARY.slice(DIAGONAL_OFFSET) : PIECE_LIBRARY;
                    if (mods.maxBlocks != null) pool = pool.filter(p => p.length <= mods.maxBlocks);
                    if (mods.minBlocks != null) pool = pool.filter(p => p.length >= mods.minBlocks);
                    if (pool.length === 0) pool = PIECE_LIBRARY;
                    return !pool.some(shape => {
                        const testPiece = { blocks: { blocks: shape.map(([x, y]) => ({ x, y })) } };
                        return canPlacePiece(board, testPiece);
                    });
                };

                const freshIfStuck = (player, board, level, mods = {}) => {
                    if (!player?.inventory) return player;
                    if (!player.inventory.some(p => p.blocks && canPlacePiece(board, p)))
                        return { ...player, inventory: generateInventory(level, mods) };
                    return player;
                };
        """;

    private static final String HTML_PART_2 = """
                function App() {
                    const [userId] = useState(() => {
                        let id = localStorage.getItem('tetris_uid');
                        if (!id) { id = Math.random().toString(36).substring(2) + Date.now().toString(36); localStorage.setItem('tetris_uid', id); }
                        return id;
                    });
                    
                    const [appVersion, setAppVersion] = useState('');
                    useEffect(() => {
                        fetch('/version')
                            .then(r => r.json())
                            .then(data => setAppVersion(data.version || ''))
                            .catch(() => {});
                    }, []);
                    
                    const [mode, setMode] = useState(() => localStorage.getItem('tetris_mode') || 'menu'); // menu|coop|solo|career-map|career-stage
                    const [gameState, setGameState] = useState(null);
                    const [playerRole, setPlayerRole] = useState(null);
                    const [selectedPieceIndex, setSelectedPieceIndex] = useState(null);
                    const [hoverCell, setHoverCell] = useState(null);
                    const [showDashboard, setShowDashboard] = useState(false);
                    const [floatingTexts, setFloatingTexts] = useState([]);
                    const [isFullscreen, setIsFullscreen] = useState(false);
                    const [careerSave, setCareerSave] = useState(null);
                    const [activeStage, setActiveStage] = useState(null);
                    const [stagePieceCount, setStagePieceCount] = useState(0);
                    const [stageResult, setStageResult] = useState(null); // null|'won'|'lost'
                    const [boardShake, setBoardShake] = useState(false);
                    const [blockTexture, setBlockTexture] = useState(() => localStorage.getItem('tetris_texture') || 'random');
                    useEffect(() => {
                        localStorage.setItem('tetris_texture', blockTexture);
                    }, [blockTexture]);
                    const [soloHighScore, setSoloHighScore] = useState(() => parseInt(localStorage.getItem('tetris_solo_hs') || '0'));
                    const [soloDifficulty, setSoloDifficulty] = useState(() => localStorage.getItem('tetris_solo_diff') || 'normal');
                    useEffect(() => { localStorage.setItem('tetris_solo_diff', soloDifficulty); }, [soloDifficulty]);
                    const gridRef = useRef(null);
                    const lastHoverRef = useRef(null);
                    const [dragData, setDragData] = useState(null);

                    useEffect(() => { localStorage.setItem('tetris_mode', mode); }, [mode]);

                    // Safety: if reloaded into career-stage with no active stage, drop to map
                    useEffect(() => {
                        if (mode === 'career-stage' && !activeStage) setMode('career-map');
                    }, [mode, activeStage]);

                    useEffect(() => {
                        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
                        document.addEventListener('fullscreenchange', onChange);
                        return () => document.removeEventListener('fullscreenchange', onChange);
                    }, []);

                    const toggleFullscreen = () => {
                        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
                        else document.exitFullscreen();
                    };

                    // --- SSE (Server-Sent Events) Setup — only co-op ---
                    useEffect(() => {
                        if (mode !== 'coop') return;
                        let es;
                        const connectSSE = () => {
                            es = new EventSource('events');
                            es.onmessage = (event) => {
                                const data = JSON.parse(event.data);
                                setGameState(data);
                                if (data.p1 && data.p1.uid === userId) setPlayerRole('p1');
                                else if (data.p2 && data.p2.uid === userId) setPlayerRole('p2');
                                else setPlayerRole(null);
                            };
                            es.onerror = () => { es.close(); setTimeout(connectSSE, 1000); };
                        };
                        connectSSE();
                        return () => { if(es) es.close(); };
                    }, [userId, mode]);

                    // Auto-reconnect: if co-op state already has our uid, restore role
                    useEffect(() => {
                        if (mode !== 'coop' || !gameState || playerRole) return;
                        if (gameState.p1 && gameState.p1.uid === userId) setPlayerRole('p1');
                        else if (gameState.p2 && gameState.p2.uid === userId) setPlayerRole('p2');
                    }, [gameState, userId, mode]);

                    // Solo init: build a fresh local state when entering solo mode
                    useEffect(() => {
                        if (mode !== 'solo' || gameState) return;
                        const diff = SOLO_DIFFICULTIES[soloDifficulty] || SOLO_DIFFICULTIES.normal;
                        const size = diff.boardSize || BOARD_SIZE;
                        setGameState({
                            board: generateComplexInitialBoard(size, diff.density),
                            p1: { uid: userId, name: 'Solo', inventory: generateInventory(1, { ...diff.modifiers, textureMode: blockTexture }) },
                            p2: null, score: 0, level: 1, lines: 0, status: 'playing',
                            clearingLines: { rows: [], cols: [] }, explosionArea: [],
                            modifiers: { ...diff.modifiers, textureMode: blockTexture }, density: diff.density, boardSize: size
                        });
                        setPlayerRole('p1'); setStagePieceCount(0); setStageResult(null);
                    }, [mode, gameState, userId, soloDifficulty]);

                    // Career stage init: build a fresh local state when entering a stage
                    useEffect(() => {
                        if (mode !== 'career-stage' || !activeStage || gameState) return;
                        const mods = { ...activeStage.modifiers, textureMode: blockTexture };
                        const size = mods.boardSize || BOARD_SIZE;
                        setGameState({
                            board: generateComplexInitialBoard(size, activeStage.density || 0),
                            p1: { uid: userId, name: 'Solo', inventory: generateInventory(1, mods) },
                            p2: null, score: 0, level: 1, lines: 0, status: 'playing',
                            clearingLines: { rows: [], cols: [] }, explosionArea: [],
                            modifiers: mods, density: activeStage.density || 0, boardSize: size
                        });
                        setPlayerRole('p1'); setStagePieceCount(0); setStageResult(null);
                    }, [mode, activeStage, gameState, userId]);

                    // Career save load
                    useEffect(() => {
                        if (mode !== 'career-map' || careerSave) return;
                        fetch(`career/${userId}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(data => setCareerSave(data || { stages: {}, totalStars: 0, lastUnlocked: 1 }))
                            .catch(() => setCareerSave({ stages: {}, totalStars: 0, lastUnlocked: 1 }));
                    }, [mode, careerSave, userId]);

                    // Solo high-score tracker
                    useEffect(() => {
                        if (mode !== 'solo' || !gameState) return;
                        if (gameState.score > soloHighScore) {
                            setSoloHighScore(gameState.score);
                            localStorage.setItem('tetris_solo_hs', String(gameState.score));
                        }
                    }, [mode, gameState, soloHighScore]);

                    // Stage objective checker
                    useEffect(() => {
                        if (mode !== 'career-stage' || !activeStage || !gameState || stageResult) return;
                        if (gameState.status === 'game_over') { setStageResult('lost'); return; }
                        const obj = activeStage.objective;
                        const achieved = obj.type === 'score' ? gameState.score : obj.type === 'lines' ? gameState.lines : stagePieceCount;
                        if (achieved >= obj.target) {
                            setStageResult('won');
                            const stars = computeStars(activeStage, gameState, stagePieceCount);
                            const save = careerSave || { stages: {}, totalStars: 0, lastUnlocked: 1 };
                            const existing = save.stages?.[activeStage.id] || { stars: 0, bestScore: 0 };
                            const newStages = { ...(save.stages || {}), [activeStage.id]: { stars: Math.max(stars, existing.stars), bestScore: Math.max(gameState.score, existing.bestScore) } };
                            const newSave = { stages: newStages, totalStars: Object.values(newStages).reduce((a, b) => a + b.stars, 0), lastUnlocked: Math.max(save.lastUnlocked || 1, activeStage.id + 1) };
                            setCareerSave(newSave);
                            fetch(`career/${userId}`, { method: 'POST', body: JSON.stringify(newSave), headers: { 'Content-Type': 'application/json' } }).catch(console.error);
                        }
                    }, [mode, activeStage, gameState, stagePieceCount, stageResult, careerSave, userId]);

                    const goToMenu = () => {
                        setMode('menu'); setGameState(null); setPlayerRole(null); setActiveStage(null);
                        setStagePieceCount(0); setStageResult(null); setShowDashboard(false);
                    };

                    const startStage = (stage) => {
                        setActiveStage(stage); setGameState(null); setPlayerRole(null);
                        setStagePieceCount(0); setStageResult(null); setMode('career-stage');
                    };

                    const retryStage = () => {
                        setGameState(null); setStagePieceCount(0); setStageResult(null);
                    };

                    // Auto-refresh: if my inventory is fully unplaceable but the board still has room, regenerate
                    useEffect(() => {
                        if (!gameState || !playerRole) return;
                        if (gameState.status !== 'playing') return;
                        if (gameState.clearingLines?.rows?.length > 0 || gameState.clearingLines?.cols?.length > 0 || gameState.explosionArea?.length > 0) return;
                        const me = gameState[playerRole];
                        if (!me?.inventory) return;
                        if (me.inventory.every(p => !p.blocks)) return;
                        const canPlay = me.inventory.some(p => p.blocks && canPlacePiece(gameState.board, p));
                        if (!canPlay) {
                            const mods = gameState.modifiers || {};
                            if (checkGameOver(gameState.board, mods)) {
                                syncState({ ...gameState, status: 'game_over' });
                            } else {
                                syncState({ ...gameState, [playerRole]: { ...me, inventory: generateInventory(gameState.level, mods) } });
                            }
                        }
                    }, [gameState, playerRole]);

                    // --- State sync: co-op broadcasts to server, solo/career stays local ---
                    const syncState = (newState) => {
                        setGameState(newState);
                        if (mode === 'coop') {
                            fetch('action', {
                                method: 'POST',
                                body: JSON.stringify(newState),
                                headers: { 'Content-Type': 'application/json' }
                            }).catch(console.error);
                        }
                    };

                    const joinGame = (role, name) => {
                        if (!gameState) return;
                        const mods = { ...(gameState.modifiers || {}), textureMode: blockTexture };
                        const newState = { ...gameState, [role]: { uid: userId, name: name, inventory: generateInventory(gameState.level, mods) } };
                        syncState(newState);
                    };

                    const resetGame = () => {
                        const mods = { ...(gameState.modifiers || {}), textureMode: blockTexture };
                        const density = gameState.density ?? 0;
                        const size = gameState.boardSize || BOARD_SIZE;
                        syncState({
                            ...gameState,
                            board: generateComplexInitialBoard(size, density),
                            p1: gameState.p1 ? { ...gameState.p1, inventory: generateInventory(1, mods) } : null,
                            p2: gameState.p2 ? { ...gameState.p2, inventory: generateInventory(1, mods) } : null,
                            score: 0, level: 1, lines: 0, status: 'playing',
                            clearingLines: { rows: [], cols: [] }, explosionArea: []
                        });
                        setSelectedPieceIndex(null); setShowDashboard(false); setStagePieceCount(0); setStageResult(null);
                    };

                    const leaveGame = () => {
                        if (!playerRole) return;
                        syncState({ ...gameState, [playerRole]: null });
                        setPlayerRole(null); setShowDashboard(false);
                    };

                    const attemptPlacement = (gridX, gridY, pieceIndex) => {
                        if (!playerRole || pieceIndex === null || !gameState) return;
                        if (gameState.clearingLines?.rows?.length > 0 || gameState.clearingLines?.cols?.length > 0 || gameState.explosionArea?.length > 0) return;

                        const size = gameState.boardSize || BOARD_SIZE;
                        const playerState = gameState[playerRole];
                        const pieceObj = playerState.inventory[pieceIndex];
                        if (!pieceObj || !pieceObj.blocks) return;
                        const piece = pieceObj.blocks;

                        // --- Explosive branch ---
                        if (piece.type === 'explosive') {
                            if (gridX < 0 || gridX >= size || gridY < 0 || gridY >= size) { vibrate([50, 50]); return; }
                            vibrate([80, 40, 200]);
                            const blastArea = [];
                            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                                const nx = gridX + dx, ny = gridY + dy;
                                if (nx >= 0 && nx < size && ny >= 0 && ny < size) blastArea.push({ x: nx, y: ny });
                            }
                            const mods = gameState.modifiers || {};
                            let newInventory = [...playerState.inventory];
                            newInventory[pieceIndex] = { blocks: null };
                            if (newInventory.every(p => p.blocks === null)) newInventory = generateInventory(gameState.level, mods);
                            const nextP1 = playerRole === 'p1' ? { ...playerState, inventory: newInventory } : gameState.p1;
                            const nextP2 = playerRole === 'p2' ? { ...playerState, inventory: newInventory } : gameState.p2;
                            syncState({ ...gameState, explosionArea: blastArea, [playerRole]: playerRole === 'p1' ? nextP1 : nextP2 });
                            setSelectedPieceIndex(null); setHoverCell(null); setDragData(null);
                            setStagePieceCount(c => c + 1);
                            setTimeout(() => {
                                let newBoard = [...gameState.board];
                                blastArea.forEach(({ x, y }) => { newBoard[y * size + x] = 0; });
                                const newScore = gameState.score;
                                const newLevel = 1 + Math.floor(newScore / 1000);
                                const freshP1 = freshIfStuck(nextP1, newBoard, newLevel, mods);
                                const freshP2 = freshIfStuck(nextP2, newBoard, newLevel, mods);
                                const isGameOver = checkGameOver(newBoard, mods);
                                syncState({ ...gameState, board: newBoard, explosionArea: [], score: newScore, lines: gameState.lines, level: newLevel, status: isGameOver ? 'game_over' : 'playing', p1: freshP1, p2: freshP2 });
                            }, 500);
                            return;
                        }

                        // --- Normal placement ---
                        let isValid = true;
                        for (const block of piece.blocks) {
                            const targetX = gridX + block.x; const targetY = gridY + block.y;
                            if (targetX < 0 || targetX >= size || targetY < 0 || targetY >= size || gameState.board[targetY * size + targetX] !== 0) {
                                isValid = false; break;
                            }
                        }

                        if (!isValid) { vibrate([50, 50]); return; }
                        vibrate(40);

                        let newBoard = [...gameState.board];
                        for (const block of piece.blocks) newBoard[(gridY + block.y) * size + (gridX + block.x)] = { color: piece.color, type: piece.type || null, texture: piece.texture || 'default' };

                        let rowsToClear = new Set(); let colsToClear = new Set();
                        for (let y = 0; y < size; y++) if (newBoard.slice(y * size, (y + 1) * size).every(v => v !== 0)) rowsToClear.add(y);
                        for (let x = 0; x < size; x++) {
                            let colComplete = true;
                            for (let y = 0; y < size; y++) { if (newBoard[y * size + x] === 0) { colComplete = false; break; } }
                            if (colComplete) colsToClear.add(x);
                        }

                        const totalLinesCleared = rowsToClear.size + colsToClear.size;
                        let newScore = gameState.score;

                        if (totalLinesCleared > 0) {
                            const comboScore = 100 * Math.pow(totalLinesCleared, 2);
                            newScore += comboScore;
                            if (dragData) {
                                const id = Date.now();
                                setFloatingTexts(prev => [...prev, { id, text: `+${comboScore}`, x: dragData.clientX, y: dragData.clientY - 50 }]);
                                setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1500);
                            }
                            if (totalLinesCleared === 1) vibrate([60, 30, 60]);
                            else if (totalLinesCleared === 2) vibrate([80, 40, 80, 40, 80]);
                            else if (totalLinesCleared === 3) vibrate([100, 50, 100, 50, 100, 50, 100]);
                            else vibrate([120, 60, 120, 60, 120, 60, 120, 60, 120, 60, 120]);
                            if (totalLinesCleared >= 2) { setBoardShake(true); setTimeout(() => setBoardShake(false), 350); }
                        }

                        let newLines = gameState.lines + totalLinesCleared;
                        let newLevel = 1 + Math.floor(newScore / 1000);
                        const mods = gameState.modifiers || {};

                        let newInventory = [...playerState.inventory];
                        newInventory[pieceIndex] = { blocks: null };
                        if (newInventory.every(p => p.blocks === null)) newInventory = generateInventory(newLevel, mods);

                        const nextP1 = playerRole === 'p1' ? { ...playerState, inventory: newInventory } : gameState.p1;
                        const nextP2 = playerRole === 'p2' ? { ...playerState, inventory: newInventory } : gameState.p2;

                        if (totalLinesCleared > 0) {
                            syncState({ ...gameState, board: newBoard, clearingLines: { rows: Array.from(rowsToClear), cols: Array.from(colsToClear) }, [playerRole]: playerRole === 'p1' ? nextP1 : nextP2 });
                            setSelectedPieceIndex(null); setHoverCell(null); setDragData(null);
                            setStagePieceCount(c => c + 1);
                            setTimeout(() => {
                                let clearedBoard = [...newBoard];
                                for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                                    if (rowsToClear.has(y) || colsToClear.has(x)) clearedBoard[y * size + x] = 0;
                                }
                                const freshP1 = freshIfStuck(nextP1, clearedBoard, newLevel, mods);
                                const freshP2 = freshIfStuck(nextP2, clearedBoard, newLevel, mods);
                                const isGameOver = checkGameOver(clearedBoard, mods);
                                syncState({ ...gameState, board: clearedBoard, clearingLines: { rows: [], cols: [] }, score: newScore, lines: newLines, level: newLevel, status: isGameOver ? 'game_over' : 'playing', p1: freshP1, p2: freshP2 });
                            }, 500);
                            return;
                        }

                        const freshP1 = freshIfStuck(nextP1, newBoard, newLevel, mods);
                        const freshP2 = freshIfStuck(nextP2, newBoard, newLevel, mods);
                        const isGameOver = checkGameOver(newBoard, mods);
                        syncState({ ...gameState, board: newBoard, p1: freshP1, p2: freshP2, score: newScore, lines: newLines, level: newLevel, status: isGameOver ? 'game_over' : 'playing' });
                        setSelectedPieceIndex(null); setHoverCell(null); setDragData(null);
                        setStagePieceCount(c => c + 1);
                    };

                    const handlePointerDown = (e, index) => {
                        e.preventDefault();
                        if (gameState.status === 'game_over' || showDashboard) return;
                        if (!canPlacePiece(gameState.board, gameState[playerRole].inventory[index])) { vibrate([30, 30]); return; }
                        
                        const target = e.currentTarget; target.setPointerCapture(e.pointerId);
                        const rect = target.getBoundingClientRect();
                        setSelectedPieceIndex(index);
                        setDragData({ index, pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType, boardRect: gridRef.current ? gridRef.current.getBoundingClientRect() : null });
                        vibrate(15); 
                    };

                    const handleGlobalPointerMove = (e) => {
                        if (!dragData) return;
                        let newDragData = { ...dragData, clientX: e.clientX, clientY: e.clientY };
                        if (gridRef.current && gameState) {
                            const rect = gridRef.current.getBoundingClientRect();
                            const size = gameState.boardSize || BOARD_SIZE;
                            const cellW = rect.width / size; const cellH = rect.height / size;
                            newDragData.boardRect = rect; newDragData.cellW = cellW; newDragData.cellH = cellH;
                            
                            const touchOffsetY = dragData.pointerType === 'touch' ? 120 : 0; 
                            const pieceX = e.clientX - dragData.offsetX; const pieceY = e.clientY - dragData.offsetY - touchOffsetY;
                            const gridX = Math.round((pieceX - rect.left) / cellW); const gridY = Math.round((pieceY - rect.top) / cellH);

                            const isNearBoard = pieceX >= rect.left - 40 && pieceX <= rect.right + 40 && pieceY >= rect.top - 40 && pieceY <= rect.bottom + 40;

                            if (isNearBoard && gridX >= -2 && gridX <= size + 2 && gridY >= -2 && gridY <= size + 2) {
                                setHoverCell({ x: gridX, y: gridY });
                                const cellId = `${gridX},${gridY}`;
                                if (lastHoverRef.current !== cellId) { lastHoverRef.current = cellId; vibrate(5); }
                            } else {
                                setHoverCell(null); lastHoverRef.current = null;
                            }
                        }
                        setDragData(newDragData);
                    };

                    const handleGlobalPointerUp = (e) => {
                        if (!dragData) return;
                        if (hoverCell) attemptPlacement(hoverCell.x, hoverCell.y, dragData.index);
                        setDragData(null); setHoverCell(null); lastHoverRef.current = null;
                    };

                    const renderMiniPiece = (pieceWrapper, isSelected, onPointerDown) => {
                        if (!pieceWrapper || !pieceWrapper.blocks) return <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100/5 rounded-xl border border-dashed border-gray-500/20"></div>;
                        const piece = pieceWrapper.blocks;
                        const maxX = Math.max(...piece.blocks.map(p => p.x)); const maxY = Math.max(...piece.blocks.map(p => p.y));
                        const gridW = maxX + 1; const gridH = maxY + 1;
                        const isPlayable = gameState && canPlacePiece(gameState.board, pieceWrapper);
                        const playabilityFilter = isPlayable ? 'hover:scale-105 shadow-md' : 'opacity-30 grayscale pointer-events-none cursor-not-allowed';
                        const grid = Array(gridH).fill(null).map(() => Array(gridW).fill(0));
                        piece.blocks.forEach(p => grid[p.y][p.x] = 1);
                        return (
                            <div onPointerDown={onPointerDown} className={`w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none transition-all duration-200 rounded-xl bg-gray-50/5 border border-white/10 ${isSelected ? 'opacity-20 scale-95 grayscale' : playabilityFilter}`}>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridW}, min(3.5vw, 16px))`, gridTemplateRows: `repeat(${gridH}, min(3.5vw, 16px))`, gap: '1px' }}>
                                    {grid.flat().map((val, idx) => (val === 1 ? <Block key={idx} cellData={piece} /> : <div key={idx} />))}
                                </div>
                            </div>
                        );
                    };

                    const renderFloatingClone = () => {
                        if (!dragData || !playerRole || !gameState) return null;
                        const pieceWrapper = gameState[playerRole].inventory[dragData.index];
                        if (!pieceWrapper || !pieceWrapper.blocks) return null;
                        const piece = pieceWrapper.blocks;
                        const maxX = Math.max(...piece.blocks.map(p => p.x)); const maxY = Math.max(...piece.blocks.map(p => p.y));
                        const gridW = maxX + 1; const gridH = maxY + 1;

                        const isSnapped = hoverCell !== null && dragData.boardRect;
                        const touchOffsetY = dragData.pointerType === 'touch' && !isSnapped ? 120 : 0; 
                        
                        let left, top, cellSize;
                        if (isSnapped) {
                            left = dragData.boardRect.left + (hoverCell.x * dragData.cellW) + 2; 
                            top = dragData.boardRect.top + (hoverCell.y * dragData.cellH) + 2;
                            cellSize = dragData.cellW - 2; 
                        } else {
                            left = dragData.clientX - dragData.offsetX;
                            top = dragData.clientY - dragData.offsetY - touchOffsetY;
                            cellSize = window.innerWidth < 640 ? window.innerWidth * 0.035 : 16; 
                        }

                        const grid = Array(gridH).fill(null).map(() => Array(gridW).fill(0));
                        piece.blocks.forEach(p => grid[p.y][p.x] = 1);

                        return (
                            <div className="fixed pointer-events-none z-[100] flex items-center justify-center" style={{ left, top, transition: isSnapped ? 'left 0.075s ease-out, top 0.075s ease-out' : 'none' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridW}, ${cellSize}px)`, gridTemplateRows: `repeat(${gridH}, ${cellSize}px)`, gap: isSnapped ? '2px' : '1px', filter: isSnapped ? 'drop-shadow(0px 10px 10px rgba(0,0,0,0.5))' : 'drop-shadow(0px 25px 25px rgba(0,0,0,0.6))', transition: 'gap 0.1s ease-out' }}>
                                    {grid.flat().map((val, idx) => (
                                        val === 1 ? <div key={idx} style={{ width: `${cellSize}px`, height: `${cellSize}px`, transition: 'width 0.1s ease-out, height 0.1s ease-out' }}><Block cellData={piece} noAnim={true} extraClass={isSnapped ? 'opacity-95' : 'scale-110'} /></div> : <div key={idx} />
                                    ))}
                                </div>
                            </div>
                        );
                    };

                    // --- Mode menu ---
                    if (mode === 'menu') {
                        const cardCls = 'w-full py-5 px-6 rounded-2xl font-black text-left transition-transform hover:-translate-y-1 shadow-lg border';
                        return (
                            <div className="flex flex-col h-screen items-center justify-center text-gray-200 p-4 font-sans bg-[#030712]">
                                <div className="bg-gray-900/60 backdrop-blur-2xl border border-gray-800 p-8 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] max-w-sm w-full">
                                    <div className="text-blue-500 mb-4 flex justify-center drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]"><IconLayers /></div>
                                    <h1 className="text-3xl font-black mb-1 tracking-tight text-center">Tetris</h1>
                                    <p className="text-gray-400 mb-8 text-sm font-medium uppercase tracking-widest text-center">Selecione um modo</p>
                                    <div className="space-y-3">
                                        <button onClick={() => { setGameState(null); setPlayerRole(null); setMode('coop'); }} className={`${cardCls} bg-gradient-to-r from-blue-600 to-cyan-700 border-blue-500/30 text-white`}>
                                            <div className="text-lg">Co-op</div>
                                            <div className="text-xs font-medium opacity-80 mt-1">Joguem juntos em tempo real</div>
                                        </button>
                                        <div className={`${cardCls} bg-gradient-to-r from-emerald-600 to-teal-700 border-emerald-500/30 text-white cursor-default`}>
                                            <div className="flex items-center justify-between mb-1"><span className="text-lg">Solo</span><span className="text-xs font-bold opacity-90">Recorde {soloHighScore}</span></div>
                                            <div className="text-xs font-medium opacity-80 mb-3">Dificuldade: <span className="font-black">{SOLO_DIFFICULTIES[soloDifficulty]?.name || 'Normal'}</span></div>
                                            <div className="grid grid-cols-5 gap-1 mb-2">
                                                {Object.entries(SOLO_DIFFICULTIES).map(([key, d]) => (
                                                    <button key={key} onClick={() => setSoloDifficulty(key)}
                                                        className={`text-[10px] py-1.5 rounded-lg font-bold border ${soloDifficulty === key ? 'bg-white/20 border-white/40' : 'bg-black/20 border-white/10 opacity-60'}`}>{d.name}</button>
                                                ))}
                                            </div>
                                            <button onClick={() => { setGameState(null); setPlayerRole(null); setMode('solo'); }} className="w-full mt-1 py-2 bg-black/30 hover:bg-black/50 rounded-lg font-black text-sm">Jogar Solo →</button>
                                        </div>
                                        <button onClick={() => { setGameState(null); setPlayerRole(null); setActiveStage(null); setMode('career-map'); }} className={`${cardCls} bg-gradient-to-r from-purple-600 to-pink-700 border-purple-500/30 text-white`}>
                                            <div className="text-lg">Carreira</div>
                                            <div className="text-xs font-medium opacity-80 mt-1">20 desafios com objetivos e estrelas</div>
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-3 flex gap-2 justify-center w-full max-w-sm">
                                    {[
                                        { key: 'random', label: '🎲', title: 'Aleatório' },
                                        { key: 'default', label: '◆', title: 'Padrão' },
                                        { key: 'candy', label: '🍭', title: 'Doce' },
                                        { key: 'stone', label: '🪨', title: 'Pedra' },
                                        { key: 'metal', label: '🔩', title: 'Metal' },
                                        { key: 'glass', label: '💎', title: 'Cristal' },
                                    ].map(t => (
                                        <button key={t.key} title={t.title} onClick={() => setBlockTexture(t.key)}
                                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-all ${blockTexture === t.key ? 'bg-blue-600 text-white ring-1 ring-blue-400 scale-110' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                                        >{t.label}</button>
                                    ))}
                                </div>
                                <div className="mt-2 text-[10px] text-gray-600 font-mono text-right w-full max-w-sm">{appVersion}</div>
                            </div>
                        );
                    }

                    // --- Career stage map ---
                    if (mode === 'career-map') {
                        if (!careerSave) return <div className="flex h-screen items-center justify-center text-gray-400 font-sans bg-[#030712]">Carregando carreira...</div>;
                        return (
                            <div className="min-h-screen text-gray-200 p-4 sm:p-8 font-sans bg-[#030712] overflow-y-auto">
                                <div className="max-w-3xl mx-auto">
                                    <div className="flex justify-between items-center mb-6">
                                        <button onClick={goToMenu} className="bg-gray-800/80 px-4 py-2 rounded-full border border-gray-700/50 text-sm font-bold">← Menu</button>
                                        <div className="text-yellow-400 font-black text-lg">⭐ {careerSave.totalStars || 0} / {CAREER_STAGES.length * 3}</div>
                                    </div>
                                    <h1 className="text-3xl font-black mb-6">Carreira</h1>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {CAREER_STAGES.map(stage => {
                                            const data = careerSave.stages?.[stage.id];
                                            const unlocked = stage.id <= (careerSave.lastUnlocked || 1);
                                            const stars = data?.stars || 0;
                                            return (
                                                <button key={stage.id} disabled={!unlocked} onClick={() => startStage(stage)}
                                                    className={`p-4 rounded-2xl border text-left transition-transform ${unlocked ? 'bg-gray-900/80 border-gray-700/50 hover:-translate-y-1' : 'bg-gray-950/50 border-gray-900 opacity-40 cursor-not-allowed'}`}>
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-xs font-bold text-gray-500">#{stage.id}</span>
                                                        <span className="text-xs">{Array(3).fill(0).map((_, i) => <span key={i} className={i < stars ? 'text-yellow-400' : 'text-gray-700'}>★</span>)}</span>
                                                    </div>
                                                    <div className="font-black text-base mb-1">{stage.name}</div>
                                                    <div className="text-xs text-gray-400 mb-2 leading-tight">{stage.hint}</div>
                                                    <div className="text-[10px] uppercase font-bold tracking-wider text-blue-400">{stage.objective.type === 'score' ? `Pontue ${stage.objective.target}` : stage.objective.type === 'lines' ? `${stage.objective.target} linhas` : `${stage.objective.target} peças`}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // --- Loading guards for co-op / solo / career-stage ---
                    if (!gameState) return <div className="flex h-screen items-center justify-center text-gray-400 font-sans bg-[#030712]">Carregando...</div>;

                    // Co-op join screen
                    if (mode === 'coop' && !playerRole) {
                        return (
                            <div className="flex flex-col h-screen items-center justify-center text-gray-200 p-4 font-sans bg-[#030712]">
                                <div className="bg-gray-900/60 backdrop-blur-2xl border border-gray-800 p-8 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] max-w-sm w-full text-center">
                                    <div className="text-blue-500 mb-6 flex justify-center drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]"><IconLayers /></div>
                                    <h1 className="text-3xl font-black mb-1 tracking-tight">Tetris Co-op</h1>
                                    <p className="text-gray-400 mb-8 text-sm font-medium uppercase tracking-widest">Escolha seu personagem</p>
                                    <div className="space-y-4">
                                        {!gameState.p1 ? <button onClick={() => joinGame('p1', 'Gabriel')} className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-2xl font-bold shadow-lg transition-transform hover:-translate-y-1">Entrar como Gabriel</button> : <div className="p-4 bg-blue-900/20 text-blue-400 rounded-2xl text-sm font-bold border border-blue-900/50">Gabriel conectado</div>}
                                        {!gameState.p2 ? <button onClick={() => joinGame('p2', 'Ana')} className="w-full py-4 bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-2xl font-bold shadow-lg transition-transform hover:-translate-y-1">Entrar como Ana</button> : <div className="p-4 bg-purple-900/20 text-purple-400 rounded-2xl text-sm font-bold border border-purple-900/50">Ana conectada</div>}
                                        <button onClick={goToMenu} className="w-full py-3 text-gray-400 hover:text-white text-sm font-bold">← Voltar ao menu</button>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    if (!playerRole) return <div className="flex h-screen items-center justify-center text-gray-400 font-sans bg-[#030712]">Carregando...</div>;

                    return (
                        <div className="fixed inset-0 text-gray-100 font-sans selection:bg-transparent overflow-hidden flex flex-col touch-none" onPointerMove={handleGlobalPointerMove} onPointerUp={handleGlobalPointerUp} onPointerLeave={handleGlobalPointerUp}>
                            {floatingTexts.map(ft => <div key={ft.id} className="fixed pointer-events-none z-[200] animate-floatUp font-black text-3xl text-yellow-400 drop-shadow-[0_5px_15px_rgba(250,204,21,0.6)]" style={{ left: ft.x, top: ft.y, transform: 'translate(-50%, -50%)' }}>{ft.text}</div>)}
                            
                            <div className="absolute top-0 left-0 right-0 p-4 sm:p-6 flex justify-between items-start z-20 pointer-events-none">
                                <button onClick={() => setShowDashboard(true)} className="pointer-events-auto bg-gray-800/80 p-3 rounded-full text-white shadow-lg border border-gray-700/50"><IconMenu /></button>
                                <div className="flex gap-2 sm:gap-4 flex-col sm:flex-row items-end sm:items-center pointer-events-auto">
                                    <div className="bg-gray-800/80 px-4 py-2 rounded-full border border-gray-700/50 shadow-lg flex items-center gap-2 text-yellow-400"><IconTrophy /><span className="font-black text-lg text-white">{gameState.score}</span></div>
                                    <div className="bg-gray-800/80 px-4 py-2 rounded-full border border-gray-700/50 shadow-lg flex items-center gap-2 hidden sm:flex text-blue-400"><IconLayers /><span className="font-bold text-sm text-white">Nível {gameState.level}</span></div>
                                    <button onClick={toggleFullscreen} className="bg-gray-800/80 p-3 rounded-full text-white shadow-lg border border-gray-700/50">{isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}</button>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center pt-24 pb-6 px-2 z-10 w-full max-w-4xl mx-auto h-full">
                                <div ref={gridRef} className={`grid gap-[2px] p-2 bg-gray-900/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] select-none touch-none border border-gray-700/60 mb-auto mt-auto ${boardShake ? 'animate-board-shake' : ''}`} style={{ gridTemplateColumns: `repeat(${gameState.boardSize || BOARD_SIZE}, minmax(0, 1fr))` }}>
                                    {gameState.board.map((cellValue, index) => {
                                        const size = gameState.boardSize || BOARD_SIZE;
                                        const x = index % size; const y = Math.floor(index / size);
                                        const inClearingRow = gameState.clearingLines?.rows?.includes(y);
                                        const inClearingCol = gameState.clearingLines?.cols?.includes(x);
                                        const inExplosion = gameState.explosionArea?.some(c => c.x === x && c.y === y);
                                        const isDissolving = inClearingRow || inClearingCol || inExplosion;
                                        const staggerDelay = inClearingRow ? x * 35 : (inClearingCol ? y * 35 : 0);
                                        return <div key={index} className="relative w-[8.5vw] h-[8.5vw] max-w-[42px] max-h-[42px] sm:max-w-[50px] sm:max-h-[50px] p-[1px]"><Block cellData={cellValue !== 0 ? cellValue : null} isDissolving={isDissolving} staggerDelay={staggerDelay} burst={inClearingRow || inClearingCol} /></div>;
                                    })}
                                </div>

                                <div className="w-full mt-4 flex justify-between px-2 sm:px-8 items-end pb-2">
                                    {(() => {
                                        const partnerRole = playerRole === 'p1' ? 'p2' : 'p1';
                                        const partnerState = gameState[partnerRole];
                                        if (!partnerState) return <div className="w-1/3"></div>;
                                        return (
                                            <div className="flex flex-col items-start gap-2 opacity-50 scale-75 origin-bottom-left pointer-events-none w-1/3">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{partnerState.name}</span>
                                                <div className="flex gap-2">{partnerState.inventory.map((piece, idx) => (<div key={`remote-${idx}`}>{renderMiniPiece(piece, false, () => {})}</div>))}</div>
                                            </div>
                                        );
                                    })()}
                                    <div className="flex flex-col items-center gap-3 w-auto flex-1">
                                        <span className="text-[11px] font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-sm">Suas Peças</span>
                                        <div className="flex gap-3 sm:gap-5 bg-gray-900/60 p-3 sm:p-4 rounded-3xl border border-gray-700/50 shadow-xl">
                                            {gameState[playerRole].inventory.map((piece, idx) => (<div key={`local-${idx}`}>{renderMiniPiece(piece, selectedPieceIndex === idx, (e) => handlePointerDown(e, idx))}</div>))}
                                        </div>
                                    </div>
                                    <div className="w-1/3 hidden sm:block"></div>
                                </div>
                            </div>

                            {renderFloatingClone()}

                            {showDashboard && (
                                <div className="absolute inset-0 z-50 flex justify-end animate-in fade-in duration-200">
                                    <div className="absolute inset-0 bg-black/60" onClick={() => setShowDashboard(false)} />
                                    <div className="relative w-full max-w-sm bg-gray-950 border-l border-gray-800 h-full p-8 flex flex-col shadow-2xl">
                                        <button onClick={() => setShowDashboard(false)} className="absolute top-6 right-6 text-gray-400 bg-gray-900 p-2 rounded-full border border-gray-800"><IconX /></button>
                                        <h2 className="text-2xl font-black text-white mb-8 mt-2">Comando</h2>
                                        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 mb-6">
                                            {(() => { const scoreInLevel = gameState.score - (gameState.level - 1) * 1000; return (<>
                                            <div className="flex justify-between items-center mb-4"><span className="text-xs font-bold uppercase text-gray-400">Nível {gameState.level} → {gameState.level + 1}</span><span className="text-xs font-black text-blue-400">{scoreInLevel} / 1000</span></div>
                                            <div className="w-full bg-black rounded-full h-3 border border-gray-800"><div className="bg-gradient-to-r from-blue-600 to-cyan-500 h-full rounded-full" style={{ width: `${Math.min(100, scoreInLevel / 10)}%` }} /></div>
                                            </>); })()}
                                        </div>
                                        <div className="bg-gray-900 p-5 rounded-2xl border border-gray-800 mb-6">
                                            <span className="text-xs font-bold uppercase text-gray-400 mb-3 block">Textura dos Blocos</span>
                                            <div className="grid grid-cols-6 gap-2">
                                                {[
                                                    { key: 'random', label: '🎲', title: 'Aleatório' },
                                                    { key: 'default', label: '◆', title: 'Padrão' },
                                                    { key: 'candy', label: '🍭', title: 'Doce' },
                                                    { key: 'stone', label: '🪨', title: 'Pedra' },
                                                    { key: 'metal', label: '🔩', title: 'Metal' },
                                                    { key: 'glass', label: '💎', title: 'Cristal' },
                                                ].map(t => (
                                                    <button key={t.key} title={t.title} onClick={() => setBlockTexture(t.key)}
                                                        className={`aspect-square rounded-xl flex items-center justify-center text-lg transition-all ${blockTexture === t.key ? 'bg-blue-600 text-white ring-2 ring-blue-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'}`}>{t.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="mt-auto flex flex-col gap-4">
                                            <button onClick={resetGame} className="w-full py-4 bg-red-500/10 text-red-500 rounded-xl font-bold border border-red-500/20 flex items-center justify-center gap-2"><IconRefresh /> Resetar Matriz</button>
                                            {mode === 'coop' && <button onClick={leaveGame} className="w-full py-4 text-gray-400 hover:text-white hover:bg-gray-900 rounded-xl font-bold flex items-center justify-center gap-2 border border-transparent"><IconLogOut /> Abandonar Sala</button>}
                                            <button onClick={goToMenu} className="w-full py-4 text-gray-400 hover:text-white hover:bg-gray-900 rounded-xl font-bold flex items-center justify-center gap-2 border border-transparent"><IconLogOut /> Voltar ao menu</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Career stage HUD strip */}
                            {mode === 'career-stage' && activeStage && (
                                <div className="absolute top-20 left-0 right-0 flex justify-center z-20 pointer-events-none">
                                    <div className="bg-gray-900/90 backdrop-blur px-4 py-2 rounded-full border border-purple-700/40 shadow-lg flex items-center gap-3 text-xs">
                                        <span className="font-black text-purple-300">#{activeStage.id} {activeStage.name}</span>
                                        <span className="text-gray-500">·</span>
                                        {(() => {
                                            const obj = activeStage.objective;
                                            const v = obj.type === 'score' ? gameState.score : obj.type === 'lines' ? gameState.lines : stagePieceCount;
                                            const label = obj.type === 'score' ? 'Pontos' : obj.type === 'lines' ? 'Linhas' : 'Peças';
                                            return <span className="font-bold text-white">{label} {v} / {obj.target}</span>;
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* Career stage result modal */}
                            {mode === 'career-stage' && stageResult && (
                                <div className="absolute inset-0 z-[60] bg-black/90 flex items-center justify-center p-4">
                                    <div className={`border p-10 rounded-[2rem] max-w-sm w-full text-center ${stageResult === 'won' ? 'bg-gray-950 border-yellow-700/50 shadow-[0_0_80px_rgba(250,204,21,0.25)]' : 'bg-gray-950 border-red-900/50 shadow-[0_0_80px_rgba(220,38,38,0.2)]'}`}>
                                        {stageResult === 'won' ? (() => {
                                            const stars = computeStars(activeStage, gameState, stagePieceCount);
                                            return (<>
                                                <div className="text-5xl mb-4">{Array(3).fill(0).map((_, i) => <span key={i} className={i < stars ? 'text-yellow-400' : 'text-gray-700'}>★</span>)}</div>
                                                <h2 className="text-3xl font-black text-white mb-2">Vitória!</h2>
                                                <p className="text-gray-400 text-sm mb-6">{activeStage.name} completo</p>
                                            </>);
                                        })() : (<>
                                            <div className="text-red-500 flex justify-center mb-4"><IconAlert /></div>
                                            <h2 className="text-3xl font-black text-white mb-2">Tente de novo</h2>
                                            <p className="text-gray-400 text-sm mb-6">Objetivo não alcançado</p>
                                        </>)}
                                        <div className="bg-black/50 rounded-2xl p-4 mb-6 border border-gray-800">
                                            <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-1">Pontuação</p>
                                            <p className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">{gameState.score}</p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button onClick={retryStage} className="w-full py-3 bg-white/10 text-white rounded-xl font-bold border border-white/10 flex items-center justify-center gap-2"><IconRefresh /> Repetir</button>
                                            {stageResult === 'won' && (() => {
                                                const next = CAREER_STAGES.find(s => s.id === activeStage.id + 1);
                                                return next ? <button onClick={() => startStage(next)} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-700 text-white rounded-xl font-bold">Próximo: {next.name} →</button> : null;
                                            })()}
                                            <button onClick={() => { setMode('career-map'); setGameState(null); setActiveStage(null); setStageResult(null); }} className="w-full py-3 text-gray-400 hover:text-white text-sm font-bold">← Mapa</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {gameState.status === 'game_over' && !(mode === 'career-stage' && stageResult) && (
                                <div className="absolute inset-0 z-[60] bg-black/90 flex items-center justify-center p-4">
                                    <div className="bg-gray-950 border border-red-900/50 p-10 rounded-[2rem] shadow-[0_0_80px_rgba(220,38,38,0.2)] max-w-sm w-full text-center">
                                        <div className="text-red-500 flex justify-center mb-6"><IconAlert /></div>
                                        <h2 className="text-4xl font-black text-white mb-3">GAME OVER</h2>
                                        <p className="text-gray-400 mb-8 text-sm">Nenhuma peça encaixa na matriz.</p>
                                        <div className="bg-black/50 rounded-2xl p-6 mb-8 border border-gray-800">
                                            <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">Pontuação{mode === 'solo' ? ' Solo' : mode === 'coop' ? ' Colaborativa' : ''}</p>
                                            <p className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">{gameState.score}</p>
                                            {mode === 'solo' && gameState.score >= soloHighScore && gameState.score > 0 && <p className="text-xs text-yellow-400 font-bold mt-2">NOVO RECORDE</p>}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button onClick={resetGame} className="w-full py-4 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-2"><IconRefresh /> Nova Partida</button>
                                            <button onClick={goToMenu} className="w-full py-3 text-gray-400 hover:text-white text-sm font-bold">← Voltar ao menu</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                }

                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(<App />);
            </script>
        </body>
        </html>
    """;

    private static final String HTML_CONTENT;
    static { HTML_CONTENT = HTML_PART_1.concat(HTML_PART_2); }
}


