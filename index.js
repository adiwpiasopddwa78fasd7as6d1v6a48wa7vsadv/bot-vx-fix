const express = require('express');
const app = express();

// =======================================================
// CONFIGURATION (ตั้งค่าตรงนี้)
// =======================================================
const WEBHOOK_URL = "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"; // <-- ใส่ webhook ใหม่ตรงนี้
const EXPLOIT_API_URL = "https://weao.xyz/api/status/exploits";
const VERSION_API_URL = "https://weao.xyz/api/versions/current";
const CHECK_INTERVAL = 60;          // แนะนำ >= 60 วิ กัน rate limit (429)
const FOOTER_TEXT = "Vereus X Status System";
// =======================================================

// ── Web Server (Keep Alive) ─────────────────────────────────
app.get('/', (req, res) => {
    res.status(200).send("<h1>Vereus X Status System is Active!</h1>");
});

function keepAlive() {
    const port = process.env.PORT || 8080;
    app.listen(port, () => {
        console.log(`[Server] Web server is running on port ${port}`);
    });
}

// ── รายชื่อตายตัวตามหมวดหมู่ที่กำหนด ──────────────────────────
const CATEGORY_LISTS = {
    "Windows Script Executor Exploits": [
        "Volt", "Potassium", "Wave", "Synapse Z", "Seliware",
        "Madium", "Cosmic", "Velocity", "SirHurt", "Solara", "Xeno"
    ],
    "Mac Script Executor Exploits": [
        "MacSploit", "Opiumware"
    ],
    "Android Script Executor Exploits": [
        "Delta", "Vega X", "Codex"
    ],
    "iOS Script Executor Exploits": [
        "Delta"
    ],
    "Windows External Exploits": [
        "Serotonin", "Severe", "RbxCli", "Lumen", "Matcha",
        "Matrix Hub", "Photon", "DX9WARE V2"
    ],
};

const CATEGORY_PLATFORM = {
    "Windows Script Executor Exploits": "Windows",
    "Mac Script Executor Exploits": "Mac",
    "Android Script Executor Exploits": "Android",
    "iOS Script Executor Exploits": "iOS",
    "Windows External Exploits": "Windows",
};

// ฟังก์ชันช่วยแสดงเวลา (เทียบเท่า time.strftime('%X'))
const getTimeStr = () => new Date().toLocaleTimeString('en-GB');

// ── ดึงสถานะ exploit ──────────────────────────────────────────
async function fetchExploitData() {
    try {
        const response = await fetch(EXPLOIT_API_URL, {
            headers: { "User-Agent": "WEAO-3PService" },
            signal: AbortSignal.timeout(15000) // Timeout 15 วินาที
        });

        if (response.status === 429) {
            console.log(`[${getTimeStr()}] โดน Rate Limit จาก WEAO Exploit API`);
            return { status: "RATELIMIT", data: [] };
        }
        if (!response.ok) {
            console.log(`[${getTimeStr()}] WEAO Exploit API ตอบกลับ status ${response.status}`);
            return { status: "OFFLINE", data: [] };
        }

        let data = await response.json();
        if (data && !Array.isArray(data)) {
            data = data.exploits || data.data || [];
        }
        return { status: "ONLINE", data };
    } catch (e) {
        console.log(`[${getTimeStr()}] บอทเกิดข้อผิดพลาดในการดึงข้อมูล: ${e.message}`);
        return { status: "OFFLINE", data: [] };
    }
}

// ── ดึงเวอร์ชัน Roblox ปัจจุบัน ─────────────────────────────────
async function fetchRobloxVersions() {
    try {
        const response = await fetch(VERSION_API_URL, {
            headers: { "User-Agent": "WEAO-3PService" },
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            console.log(`[${getTimeStr()}] WEAO Version API ตอบกลับ status ${response.status}`);
            return null;
        }
        return await response.json();
    } catch (e) {
        console.log(`[${getTimeStr()}] ดึงข้อมูล Roblox Version ผิดพลาด: ${e.message}`);
        return null;
    }
}

function getStatusText(ex) {
    const updateOk = ex.updateStatus ?? false;
    const hasIssues = ex.hasIssues ?? false;

    if (!updateOk) return "🔴 Patched";
    if (hasIssues) return "🟠 Issues";
    return "🟢 Working";
}

function categorizeExecutors(exploits) {
    let categorized = {};
    for (const cat in CATEGORY_LISTS) categorized[cat] = [];

    const lookup = {};
    for (const ex of exploits) {
        const title = ex.title || "";
        const platform = ex.platform || "";
        lookup[`${title}|${platform}`] = ex;
    }

    for (const [category, names] of Object.entries(CATEGORY_LISTS)) {
        const platform = CATEGORY_PLATFORM[category];
        for (const name of names) {
            const ex = lookup[`${name}|${platform}`];
            if (ex) {
                const statusStr = getStatusText(ex);
                categorized[category].push(`**${name}** : ${statusStr}`);
            } else {
                categorized[category].push(`**${name}** : ⚪ Not Found`);
            }
        }
    }
    return categorized;
}

// ── สร้าง field หมวด Roblox Version ─────────────────────────────
function buildVersionField(versions) {
    if (!versions) {
        return { name: "🧩 Roblox Version Update Tracker", value: "*Unable to fetch version data*", inline: false };
    }

    const winVer = versions.Windows || "Unknown";
    const winDate = versions.WindowsDate || "";
    const macVer = versions.Mac || "Unknown";
    const macDate = versions.MacDate || "";
    const andVer = versions.Android || "Unknown";
    const andDate = versions.AndroidDate || "";
    const iosVer = versions.iOS || "Unknown";
    const iosDate = versions.iOSDate || "";

    const lines = [
        `**Roblox Windows** : \`${winVer}\`\n└ Last Updated: ${winDate}`,
        `**Roblox Mac** : \`${macVer}\`\n└ Last Updated: ${macDate}`,
        `**Roblox Android-iOS** : \`Android ${andVer}\` / \`iOS ${iosVer}\`\n└ Android: ${andDate}\n└ iOS: ${iosDate}`
    ];

    return { name: "🧩 Roblox Version Update Tracker", value: lines.join("\n\n"), inline: false };
}

function buildEmbed(apiStatus, categories, versions) {
    const fields = [];

    // ── หมวด Roblox Version ขึ้นก่อนเป็นอันดับแรก ──
    fields.push(buildVersionField(versions));

    // ── หมวด Exploit ตามเดิม ──
    for (const [category, items] of Object.entries(categories)) {
        let valueText = items.length > 0 ? items.join("\n") : "*No data in this category*";
        if (valueText.length > 1024) {
            valueText = valueText.substring(0, 1000) + "\n...(truncated)";
        }
        fields.push({ name: `💻 ${category}`, value: valueText, inline: false });
    }

    let embedColor, statusLabel;
    if (apiStatus === "ONLINE") {
        embedColor = 65280;
        statusLabel = "🟢 ONLINE";
    } else if (apiStatus === "RATELIMIT") {
        embedColor = 16776960;
        statusLabel = "🟡 RATE LIMITED";
    } else {
        embedColor = 16711680;
        statusLabel = "🔴 OFFLINE";
    }

    const payload = {
        embeds: [
            {
                title: "🛡️ WEAO Status by siw",
                description: `**🌐 WEBSITE WEAO STATUS:** ${statusLabel}\n\n🟢 Working = UPDATE  |  🟠 Issues = WAITING FIX  |  🔴 Patched = DOWN`,
                color: embedColor,
                fields: fields,
                timestamp: new Date().toISOString(),
                footer: { text: `${FOOTER_TEXT} | Last Updated: ${getTimeStr()}` }
            }
        ]
    };
    return payload;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function monitorLoop() {
    let messageId = null;
    const webhookUrlWithWait = WEBHOOK_URL.includes("?wait=true") ? WEBHOOK_URL : `${WEBHOOK_URL}?wait=true`;
    
    await sleep(3000);
    console.log("=== ระบบดึงข้อมูล Exploit + Roblox Version จาก WEAO API เริ่มทำงาน ===");

    while (true) {
        const { status: apiStatus, data: exploits } = await fetchExploitData();
        const versions = await fetchRobloxVersions();

        let categories;
        if (exploits && exploits.length > 0) {
            categories = categorizeExecutors(exploits);
        } else {
            categories = {};
            for (const cat in CATEGORY_LISTS) categories[cat] = [];
        }

        const payload = buildEmbed(apiStatus, categories, versions);

        try {
            if (!messageId) {
                // โพสต์ครั้งแรก (POST)
                const response = await fetch(webhookUrlWithWait, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.status === 200 || response.status === 201) {
                    const resData = await response.json();
                    messageId = resData.id;
                    console.log(`[${getTimeStr()}] สร้างข้อความหลักสำเร็จ (ID: ${messageId})`);
                } else {
                    const text = await response.text();
                    console.log(`[${getTimeStr()}] ส่ง Webhook ไม่สำเร็จ: ${response.status} - ${text}`);
                }
            } else {
                // อัปเดตข้อความเดิม (PATCH)
                const cleanUrl = WEBHOOK_URL.split('?')[0];
                const editUrl = `${cleanUrl}/messages/${messageId}`;
                
                const response = await fetch(editUrl, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.status === 200) {
                    console.log(`[${getTimeStr()}] อัปเดตสถานะเรียบร้อย (${apiStatus})`);
                } else if (response.status === 404) {
                    messageId = null; // ข้อความอาจจะถูกลบไปแล้ว ให้โพสต์ใหม่รอบหน้า
                } else {
                    console.log(`[${getTimeStr()}] แก้ไขข้อความไม่สำเร็จ: ${response.status}`);
                }
            }
        } catch (e) {
            console.log(`[${getTimeStr()}] Discord Webhook Error: ${e.message}`);
        }

        await sleep(CHECK_INTERVAL * 1000);
    }
}

// ── เริ่มการทำงาน ─────────────────────────────────────────────
keepAlive();
monitorLoop();
