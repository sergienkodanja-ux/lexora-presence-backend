const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "40kb" }));

const presence = new Map();
const TTL_MS = 45_000;

const ircMessages = [];
let nextMessageId = 1;
const IRC_TTL_MS = 1000 * 60 * 60;

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

    const server = String(req.body.server || "").trim().toLowerCase();
    const uuid = String(req.body.uuid || "").trim();
    const name = String(req.body.name || "").trim().slice(0, 32);
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
        version,
        lastSeen: Date.now()
    });

    const users = [];
    const now = Date.now();

    for (const value of presence.values()) {
        if (value.server === server && now - value.lastSeen <= TTL_MS) {
            users.push(value.uuid);
        }
    }

    res.json({ users });
});

app.post("/api/irc/send", (req, res) => {
    cleanup();

    const server = String(req.body.server || "").trim().toLowerCase();
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

    const server = String(req.query.server || "").trim().toLowerCase();
    const after = Number(req.query.after || 0);

    if (!server) {
        return res.status(400).json({ error: "bad_request" });
    }

    const messages = ircMessages.filter(message =>
        message.server === server && message.id > after
    );

    res.json({ messages });
});

app.get("/", (req, res) => {
    res.send("Lexora Presence Backend is running");
});

app.listen(PORT, () => {
    console.log(`Lexora Presence Backend started on port ${PORT}`);
});
