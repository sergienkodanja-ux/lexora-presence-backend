const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "40kb" }));

const presence = new Map();
const TTL_MS = 45_000;

const ircMessages = [];
let nextMessageId = 1;
const IRC_TTL_MS = 1000 * 60 * 60;

function normalizeServer(value) {
    let server = String(value || "").trim().toLowerCase();

    server = server.replace(/^https?:\/\//, "");
    server = server.replace(/^wss?:\/\//, "");

    const slashIndex = server.indexOf("/");
    if (slashIndex >= 0) server = server.substring(0, slashIndex);

    const colonIndex = server.indexOf(":");
    if (colonIndex >= 0) server = server.substring(0, colonIndex);

    server = server.replace(/\.$/, "");

    const prefixes = [
        "mc.",
        "play.",
        "join.",
        "go.",
        "connect.",
        "server.",
        "bedrock.",
        "msk.",
        "msk1.",
        "msk2.",
        "ru.",
        "s1.",
        "s2.",
        "s3.",
        "hub.",
        "lobby."
    ];

    let changed = true;

    while (changed) {
        changed = false;

        for (const prefix of prefixes) {
            if (server.startsWith(prefix)) {
                server = server.substring(prefix.length);
                changed = true;
                break;
            }
        }
    }

    if (server.includes("funtime")) return "funtime";
    if (server.includes("fun-time")) return "funtime";
    if (server.includes("spookytime")) return "spookytime";
    if (server.includes("spooky")) return "spookytime";
    if (server.includes("dexland")) return "dexland";

    const parts = server.split(".").filter(Boolean);

    if (parts.length >= 2) {
        return parts[0];
    }

    return server || "unknown";
}

function normalizeName(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/gi, "")
        .slice(0, 32);
}

function key(server, uuid) {
    return `${server}|${uuid}`;
}

function cleanup() {
    const now = Date.now();

    for (const [k, value] of presence.entries()) {
        if (now - value.lastSeen > TTL_MS) {
            presence.delete(k);
        }
    }

    while (ircMessages.length > 0 && now - ircMessages[0].time > IRC_TTL_MS) {
        ircMessages.shift();
    }

    while (ircMessages.length > 300) {
        ircMessages.shift();
    }
}

app.post("/api/presence", (req, res) => {
    cleanup();

    const server = normalizeServer(req.body.server);
    const uuid = String(req.body.uuid || "").trim();
    const name = String(req.body.name || "").trim().slice(0, 32);
    const cleanName = normalizeName(name);
    const version = String(req.body.version || "").trim().slice(0, 32);

    if (!server || !uuid) {
        return res.status(400).json({ error: "bad_request" });
    }

    if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
        return res.status(400).json({ error: "bad_uuid" });
    }

    presence.set(key(server, uuid), {
        server,
        uuid,
        name,
        cleanName,
        version,
        lastSeen: Date.now()
    });

    const users = [];
    const names = [];
    const now = Date.now();

    for (const value of presence.values()) {
        if (value.server === server && now - value.lastSeen <= TTL_MS) {
            users.push(value.uuid);

            if (value.cleanName) {
                names.push(value.cleanName);
            }
        }
    }

    res.json({
        server,
        users,
        names
    });
});

app.post("/api/irc/send", (req, res) => {
    cleanup();

    const server = normalizeServer(req.body.server);
    const uuid = String(req.body.uuid || "").trim();
    const name = String(req.body.name || "").trim().slice(0, 32);
    const text = String(req.body.text || "").trim().slice(0, 200);

    if (!server || !uuid || !name || !text) {
        return res.status(400).json({ error: "bad_request" });
    }

    if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
        return res.status(400).json({ error: "bad_uuid" });
    }

    const message = {
        id: nextMessageId++,
        server,
        uuid,
        name,
        text,
        time: Date.now()
    };

    ircMessages.push(message);

    res.json({
        ok: true,
        message
    });
});

app.get("/api/irc/poll", (req, res) => {
    cleanup();

    const server = normalizeServer(req.query.server);
    const after = Number(req.query.after || 0);

    if (!server) {
        return res.status(400).json({ error: "bad_request" });
    }

    const messages = ircMessages.filter(message =>
        message.server === server && message.id > after
    );

    res.json({
        server,
        messages
    });
});

app.get("/", (req, res) => {
    res.send("Lexora Presence Backend is running");
});

app.listen(PORT, () => {
    console.log(`Lexora Presence Backend started on port ${PORT}`);
});
