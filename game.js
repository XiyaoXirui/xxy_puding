const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// --- Game State ---
let gameState = 'playing'; // 'playing', 'levelUp', 'bossFight', 'gameOver', 'gameWon'
let enemies = [];
let projectiles = [];
let enemyProjectiles = [];
let experienceOrbs = [];
let effects = [];
let score = 0;
let level = 1;
const BOSS_LEVEL = 5;
let currentUpgrades = [];
let boss = null;

// --- Player ---
const player = {
    x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2,
    width: 40, height: 40,
    color: 'rgba(255, 215, 0, 0.8)', headColor: 'red',
    speed: 4, dx: 0, dy: 0,
    maxHealth: 100, health: 100,
    attackCooldown: 0, attackRate: 30, projectileSpeed: 7, projectileDamage: 10,
    projectileCount: 1,
    shieldActive: false, shieldDuration: 60, shieldCooldown: 600, shieldTimer: 0,
    exp: 0, expToNextLevel: 100,
    // Gyro upgrade
    hasGyro: false,
    gyroCooldown: 0,
    gyroDuration: 0,
    spinAngle: 0,
    originalAttackRate: null,
    // Bomb upgrade
    hasBomb: false,
    bombCooldown: 0,
    bombDuration: 0,
    originalProjectileDamage: null,
    explosionRadius: 50,
    // Puppet upgrade
    hasClone: false,
    positionHistory: [],
    // Ice upgrade
    hasIce: false,
    // Magnet upgrade
    hasMagnet: false,
};

const clone = {
    x: -100, y: -100, // initially off-screen
    width: 40, height: 40,
    color: 'rgba(255, 215, 0, 0.4)', // semi-transparent
    headColor: 'rgba(255, 0, 0, 0.4)',
};

// --- Keyboard input state ---
const keys = { w: false, a: false, s: false, d: false, ' ': false };

// --- Game Loop Globals ---
let enemySpawnTimer = 0;
const enemySpawnInterval = 100;

// --- Upgrade Definitions ---
const upgradePool = [
    { icon: '🔴', title: '辣椒 (Chili)', description: '攻击速度 +15%', apply: () => player.attackRate = Math.max(5, player.attackRate * 0.85) },
    { icon: '🔵', title: '冰块 (Ice)', description: '攻击附带减速效果', apply: () => player.hasIce = true },
    { icon: '🟣', title: '磁铁 (Magnet)', description: '自动吸附经验', apply: () => player.hasMagnet = true },
    { icon: '🟢', title: '菠菜 (Spinach)', description: '最大生命值 +20, 并回满', apply: () => { player.maxHealth += 20; player.health = player.maxHealth; } },
    { icon: '🟡', title: '闪电 (Lightning)', description: '子弹伤害 +20%', apply: () => player.projectileDamage = Math.ceil(player.projectileDamage * 1.2) },
    { icon: '👟', title: '跑鞋 (Shoes)', description: '移动速度 +10%', apply: () => player.speed *= 1.1 },
    { icon: '🛡️', title: '硬壳 (Hard Shell)', description: '护盾冷却 -15%', apply: () => player.shieldCooldown *= 0.85 },
    { icon: '🍎', title: '苹果 (Apple)', description: '增加一个枪口', apply: () => player.projectileCount++ },
    { icon: '🌀', title: '陀螺 (Gyro)', description: '每15秒旋转攻击5秒,攻速+20%', apply: () => { player.hasGyro = true; player.gyroCooldown = 15 * 60; } },
    { icon: '💣', title: '炸弹 (Bomb)', description: '每15秒子弹变为爆炸子弹, 伤害+20%, 持续5秒', apply: () => { player.hasBomb = true; player.bombCooldown = 15 * 60; } },
    { icon: '🎎', title: '布偶 (Puppet)', description: '召唤一个模仿你动作的分身', apply: () => player.hasClone = true },
];

// --- Drawing Functions ---
function drawPlayer() {
    if (player.shieldActive) {
        ctx.fillStyle = 'rgba(0, 150, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.width, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.roundRect(player.x, player.y, player.width, player.height, [10]);
    ctx.fill();
    ctx.fillStyle = player.headColor;
    ctx.beginPath();
    const headX = player.x + player.width / 2, headY = player.y;
    ctx.moveTo(headX, headY - 10);
    ctx.lineTo(headX - 5, headY);
    ctx.lineTo(headX + 5, headY);
    ctx.closePath();
    ctx.fill();
}

function drawClone() {
    ctx.fillStyle = clone.color;
    ctx.beginPath();
    ctx.roundRect(clone.x, clone.y, clone.width, clone.height, [10]);
    ctx.fill();
    ctx.fillStyle = clone.headColor;
    ctx.beginPath();
    const headX = clone.x + clone.width / 2, headY = clone.y;
    ctx.moveTo(headX, headY - 10);
    ctx.lineTo(headX - 5, headY);
    ctx.lineTo(headX + 5, headY);
    ctx.closePath();
    ctx.fill();
}

function drawEnemies() {
    enemies.forEach(e => {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        switch(e.type) {
            case 'tomato':
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                break;
            case 'carrot':
                ctx.moveTo(e.x, e.y - e.size);
                ctx.lineTo(e.x - e.size / 2, e.y + e.size / 2);
                ctx.lineTo(e.x + e.size / 2, e.y + e.size / 2);
                ctx.closePath();
                break;
            case 'potato':
                ctx.roundRect(e.x - e.size/2, e.y - e.size/2, e.size, e.size, 5);
                if(e.arming) {
                    ctx.fillStyle = `rgba(255, 0, 0, ${0.1 + (e.armTimer / e.armTime) * 0.4})`;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y, e.blastRadius, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
        }
        ctx.fill();
    });
}

function drawProjectiles() {
    projectiles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    });
    enemyProjectiles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.width/2, -p.height/2, p.width, p.height);
        ctx.restore();
    });
}

function drawExperienceOrbs() {
    experienceOrbs.forEach(orb => {
        ctx.fillStyle = 'cyan';
        ctx.beginPath(); ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2); ctx.fill();
    });
}

function drawEffects() {
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        effect.duration--;
        if (effect.duration <= 0) {
            effects.splice(i, 1);
            continue;
        }
        
        // 激光预警效果
        if (effect.isLaser) {
            const alpha = effect.duration / effect.maxDuration;
            ctx.strokeStyle = `rgba(255, 0, 0, ${alpha * 0.8})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 10]);
            ctx.beginPath();
            ctx.moveTo(effect.x, effect.y);
            const angle = Math.atan2(effect.targetY - effect.y, effect.targetX - effect.x);
            ctx.lineTo(effect.x + Math.cos(angle) * 800, effect.y + Math.sin(angle) * 800);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // 预警点
            ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
            ctx.beginPath();
            ctx.arc(effect.targetX, effect.targetY, 20 * (1-alpha), 0, Math.PI * 2);
            ctx.fill();
        } else {
            // 普通爆炸效果
            ctx.fillStyle = `rgba(255, 100, 0, ${effect.duration / effect.maxDuration * 0.8})`;
            ctx.beginPath();
            ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawBoss() {
    if (!boss) return;
    
    // Boss身体阴影效果
    ctx.fillStyle = 'rgba(0, 50, 0, 0.3)';
    ctx.beginPath();
    ctx.roundRect(boss.x - boss.width/2 + 10, boss.y - boss.height/2 + 10, boss.width, boss.height, 20);
    ctx.fill();
    
    // 根据阶段改变颜色
    const bodyColor = boss.enraged ? 'darkred' : 'darkgreen';
    const headColor = boss.enraged ? 'red' : 'green';
    const glowColor = boss.enraged ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 0, 0.3)';
    
    // 发光效果
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.width * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    // Boss身体
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(boss.x - boss.width/2, boss.y - boss.height/2, boss.width, boss.height, 20);
    ctx.fill();
    
    // Boss头部（西兰花形状）
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.arc(boss.x - 40, boss.y - 30, 25, 0, Math.PI * 2);
    ctx.arc(boss.x + 40, boss.y - 30, 25, 0, Math.PI * 2);
    ctx.arc(boss.x, boss.y - 50, 30, 0, Math.PI * 2);
    ctx.arc(boss.x - 20, boss.y - 60, 20, 0, Math.PI * 2);
    ctx.arc(boss.x + 20, boss.y - 60, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // 愤怒时的眼睛
    if (boss.enraged) {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(boss.x - 30, boss.y, 8, 0, Math.PI * 2);
        ctx.arc(boss.x + 30, boss.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(boss.x - 30, boss.y, 4, 0, Math.PI * 2);
        ctx.arc(boss.x + 30, boss.y, 4, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // 普通眼睛
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(boss.x - 30, boss.y, 8, 0, Math.PI * 2);
        ctx.arc(boss.x + 30, boss.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(boss.x - 30, boss.y, 4, 0, Math.PI * 2);
        ctx.arc(boss.x + 30, boss.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 嘴巴
    ctx.fillStyle = boss.enraged ? 'darkred' : 'darkgreen';
    ctx.beginPath();
    if (boss.enraged) {
        // 愤怒时张开嘴
        ctx.arc(boss.x, boss.y + 20, 15, 0, Math.PI, false);
    } else {
        ctx.arc(boss.x, boss.y + 20, 10, 0, Math.PI, false);
    }
    ctx.fill();
}

function drawUI() {
    ctx.fillStyle = 'grey'; ctx.fillRect(10, 10, 200, 20);
    ctx.fillStyle = 'green'; ctx.fillRect(10, 10, (player.health / player.maxHealth) * 200, 20);
    ctx.strokeStyle = 'black'; ctx.strokeRect(10, 10, 200, 20);
    ctx.fillStyle = 'grey'; ctx.fillRect(10, 35, 200, 15);
    ctx.fillStyle = 'cyan'; ctx.fillRect(10, 35, (player.exp / player.expToNextLevel) * 200, 15);
    ctx.strokeStyle = 'black'; ctx.strokeRect(10, 35, 200, 15);
    ctx.fillStyle = 'black'; ctx.font = '20px sans-serif';
    ctx.fillText('Score: ' + score, CANVAS_WIDTH - 150, 30);
    ctx.fillText('Level: ' + level, CANVAS_WIDTH - 150, 60);
    if(player.shieldTimer > 0 && !player.shieldActive) {
        ctx.fillText(`Shield CD: ${(player.shieldTimer / 60).toFixed(1)}s`, 10, 70);
    }
    if (gameState === 'bossFight' && boss) {
        const barWidth = CANVAS_WIDTH - 200;
        const healthPercent = boss.health / boss.maxHealth;
        
        // 血条背景
        ctx.fillStyle = 'grey'; ctx.fillRect(100, CANVAS_HEIGHT - 40, barWidth, 25);
        
        // 血条颜色根据阶段变化
        const healthColor = boss.enraged ? 'red' : 'purple';
        ctx.fillStyle = healthColor; 
        ctx.fillRect(100, CANVAS_HEIGHT - 40, healthPercent * barWidth, 25);
        
        // 血条边框
        ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
        ctx.strokeRect(100, CANVAS_HEIGHT - 40, barWidth, 25);
        
        // Boss名称
        ctx.fillStyle = 'white'; ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        const bossName = boss.enraged ? '🔥 狂暴西兰花巨人 (ENRAGED) 🔥' : '西兰花巨人 (Broccoli Giant)';
        ctx.fillText(bossName, CANVAS_WIDTH/2, CANVAS_HEIGHT - 22);
        
        // 血量数值
        ctx.font = '12px sans-serif';
        ctx.fillText(`${Math.floor(boss.health)}/${boss.maxHealth}`, CANVAS_WIDTH/2, CANVAS_HEIGHT - 8);
        
        // 阶段提示
        if (boss.enraged) {
            ctx.fillStyle = 'red'; ctx.font = 'bold 20px sans-serif';
            ctx.fillText('⚠️ 第二阶段 - 狂暴模式! ⚠️', CANVAS_WIDTH/2, 80);
        }
        
        ctx.textAlign = 'left';
    }
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; 
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = 'red'; 
    ctx.font = 'bold 70px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💀 GAME OVER 💀', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);
    
    ctx.fillStyle = 'white';
    ctx.font = '30px sans-serif';
    ctx.fillText('布丁勇者被击败了...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'gold';
    ctx.fillText(`最终得分: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
    
    ctx.fillStyle = 'lightgray';
    ctx.font = '20px sans-serif';
    ctx.fillText('按 Enter 键重新开始', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 100);
    ctx.textAlign = 'left';
}

function drawGameWon() {
    // 渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // 庆祝文字
    ctx.fillStyle = 'darkblue'; 
    ctx.font = 'bold 70px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎉 胜利! YOU WON! 🎉', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80);
    
    ctx.font = 'bold 35px sans-serif';
    ctx.fillStyle = 'darkgreen';
    ctx.fillText('你击败了西兰花巨人!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
    
    ctx.font = '28px sans-serif';
    ctx.fillStyle = 'purple';
    ctx.fillText('世界的"甜味素"已找回!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
    
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = 'darkred';
    ctx.fillText(`最终得分: ${score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80);
    
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'black';
    ctx.fillText('按 Enter 键再次挑战', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 130);
    
    // 装饰性星星
    for(let i=0; i<10; i++) {
        const x = 100 + Math.random() * (CANVAS_WIDTH - 200);
        const y = 100 + Math.random() * (CANVAS_HEIGHT - 200);
        ctx.fillStyle = `rgba(255, 215, 0, ${0.5 + Math.random() * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, 5 + Math.random() * 10, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.textAlign = 'left';
}

function drawLevelUpScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = 'white'; ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL UP! CHOOSE AN UPGRADE', CANVAS_WIDTH / 2, 100);
    currentUpgrades.forEach((upgrade, index) => {
        const cardX = 150 + index * 200, cardY = 200, cardWidth = 150, cardHeight = 200;
        ctx.fillStyle = '#eee'; ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
        ctx.strokeStyle = 'gold'; ctx.lineWidth = 3; ctx.strokeRect(cardX, cardY, cardWidth, cardHeight);
        ctx.fillStyle = 'black'; ctx.font = '40px sans-serif';
        ctx.fillText(upgrade.icon, cardX + cardWidth / 2, cardY + 60);
        ctx.font = '18px sans-serif';
        ctx.fillText(upgrade.title, cardX + cardWidth / 2, cardY + 110);
        ctx.font = '14px sans-serif';
        ctx.fillText(upgrade.description, cardX + cardWidth / 2, cardY + 150);
    });
    ctx.textAlign = 'left';
}

function clearCanvas() { ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); }

// --- Entity Creation ---
function createEnemy() {
    let x, y;
    if (Math.random() < 0.5) { x = Math.random() < 0.5 ? 0 - 30 : CANVAS_WIDTH + 30; y = Math.random() * CANVAS_HEIGHT; } 
    else { x = Math.random() * CANVAS_WIDTH; y = Math.random() < 0.5 ? 0 - 30 : CANVAS_HEIGHT + 30; }
    
        const rand = Math.random();
    if (rand < 0.5) {
         enemies.push({ type: 'tomato', x, y, radius: 15, color: 'red', speed: 2, originalSpeed: 2, slowed: false, slowTimer: 0, health: 10 * level, damage: 10 });
    } else if (rand < 0.85) {
        enemies.push({ type: 'carrot', x, y, size: 20, color: 'orange', speed: 1, originalSpeed: 1, slowed: false, slowTimer: 0, health: 15 * level, damage: 0, attackCooldown: 120 });
    } else {
        enemies.push({ type: 'potato', x, y, size: 25, color: '#8B4513', health: 30 * level, arming: false, armTime: 180, armTimer: 0, blastRadius: 100, damage: 25 });
    }
}

function createExperienceOrb(x, y) { experienceOrbs.push({ x, y, radius: 5 }); }

function createBoss() {
    boss = {
        x: CANVAS_WIDTH / 2, y: 150,
        width: 150, height: 120,
        maxHealth: 2000, health: 2000,
        attackTimer: 0, attackPattern: 'rain', moveDirection: 1,
        phase: 1, enraged: false,
        summonTimer: 300, // 召唤小怪的计时器
        spinAttackTimer: 0, // 旋转攻击计时器
        spinAngle: 0,
    };
    gameState = 'bossFight';
    enemies = [];
}

// --- Game Logic ---
function resetGame() {
    player.maxHealth = 100; player.health = 100;
    player.speed = 4; player.attackRate = 30; player.projectileDamage = 10;
    player.projectileCount = 1;
    player.x = CANVAS_WIDTH / 2; player.y = CANVAS_HEIGHT / 2;
    player.shieldTimer = 0; player.shieldActive = false;
    player.exp = 0; player.expToNextLevel = 100;
    player.hasGyro = false;
    player.gyroCooldown = 0;
    player.gyroDuration = 0;
    player.spinAngle = 0;
    player.originalAttackRate = null;
    player.hasBomb = false;
    player.bombCooldown = 0;
    player.bombDuration = 0;
    player.originalProjectileDamage = null;
    player.hasClone = false;
    player.positionHistory = [];
    player.hasIce = false;
    player.hasMagnet = false;
    clone.x = -100;
    clone.y = -100;
    level = 1;
    enemies = []; projectiles = []; enemyProjectiles = []; experienceOrbs = []; effects = [];
    score = 0;
    boss = null;
    gameState = 'playing';
}

function updatePlayer() {
    player.x += player.dx; player.y += player.dy;
    if (player.x > CANVAS_WIDTH) player.x = 0;
    if (player.x < 0) player.x = CANVAS_WIDTH;
    if (player.y > CANVAS_HEIGHT) player.y = 0;
    if (player.y < 0) player.y = CANVAS_HEIGHT;

    if (player.hasClone) {
        player.positionHistory.push({x: player.x, y: player.y});
        if (player.positionHistory.length > 30) { // 30 frames delay
            const pos = player.positionHistory.shift();
            clone.x = pos.x;
            clone.y = pos.y;
        }
    }

    if (player.shieldTimer > 0) player.shieldTimer--;
    if (keys[' '] && player.shieldTimer <= 0) {
        player.shieldActive = true;
        player.shieldTimer = player.shieldCooldown;
        setTimeout(() => player.shieldActive = false, player.shieldDuration * 1000 / 60);
    }

    if (player.hasGyro) {
        if (player.gyroDuration > 0) {
            player.gyroDuration--;
            if (player.gyroDuration <= 0) {
                player.attackRate = player.originalAttackRate;
                player.gyroCooldown = 15 * 60; // 15 seconds cooldown
            }
        } else {
            player.gyroCooldown--;
            if (player.gyroCooldown <= 0) {
                player.gyroDuration = 5 * 60; // 5 seconds duration
                player.originalAttackRate = player.attackRate;
                player.attackRate *= 0.8; // 20% attack speed increase
            }
        }
    }

    if (player.hasBomb) {
        if (player.bombDuration > 0) {
            player.bombDuration--;
            if (player.bombDuration <= 0) {
                // bomb effect ended
                player.projectileDamage = player.originalProjectileDamage;
                player.bombCooldown = 15 * 60; // reset cooldown
            }
        } else {
            player.bombCooldown--;
            if (player.bombCooldown <= 0) {
                // start bomb effect
                player.bombDuration = 5 * 60; // 5 seconds duration
                player.originalProjectileDamage = player.projectileDamage;
                player.projectileDamage *= 1.2; // 20% damage increase
            }
        }
    }

    player.attackCooldown--;
    if (player.attackCooldown <= 0 && (enemies.length > 0 || boss)) {
        if (player.hasGyro && player.gyroDuration > 0) {
            player.spinAngle += 0.5;
            for(let i=0; i<8; i++) {
                const angle = player.spinAngle + (i * Math.PI / 4);
                 projectiles.push({ 
                    x: player.x + player.width / 2, y: player.y + player.height / 2, 
                    radius: 5, color: 'rgba(255, 215, 0, 1)', 
                    speed: player.projectileSpeed, 
                    dx: Math.cos(angle), dy: Math.sin(angle), 
                    damage: player.projectileDamage,
                    isExplosive: player.hasBomb && player.bombDuration > 0
                });
            }
            player.attackCooldown = player.attackRate;
        } else {
            let target = null;
            if(boss) {
                target = boss;
            } else {
                target = enemies.reduce((c, e) => { let d = Math.hypot(e.x - player.x, e.y - player.y); return d < c.d ? { e, d } : c; }, { e: null, d: Infinity }).e;
            }
            
            if (target) {
                const angle = Math.atan2(target.y - player.y, target.x - player.x);
                const numProjectiles = player.projectileCount;
                const spread = 15; // px between projectiles
                for (let i = 0; i < numProjectiles; i++) {
                    const offset = (i - (numProjectiles - 1) / 2) * spread;
                    const x = player.x + player.width / 2 + offset * Math.cos(angle + Math.PI / 2);
                    const y = player.y + player.height / 2 + offset * Math.sin(angle + Math.PI / 2);
                    projectiles.push({ x, y, radius: 5, color: 'rgba(255, 215, 0, 1)', speed: player.projectileSpeed, dx: Math.cos(angle), dy: Math.sin(angle), damage: player.projectileDamage, isExplosive: player.hasBomb && player.bombDuration > 0 });
                }
                player.attackCooldown = player.attackRate;

                if (player.hasClone && clone.x > 0) {
                    const cloneAngle = Math.atan2(target.y - clone.y, target.x - clone.x);
                    for (let i = 0; i < numProjectiles; i++) {
                        const offset = (i - (numProjectiles - 1) / 2) * spread;
                        const x = clone.x + clone.width / 2 + offset * Math.cos(cloneAngle + Math.PI / 2);
                        const y = clone.y + clone.height / 2 + offset * Math.sin(cloneAngle + Math.PI / 2);
                        projectiles.push({ x, y, radius: 5, color: 'rgba(255, 215, 0, 0.5)', speed: player.projectileSpeed, dx: Math.cos(cloneAngle), dy: Math.sin(cloneAngle), damage: player.projectileDamage, isExplosive: player.hasBomb && player.bombDuration > 0 });
                    }
                }
            }
        }
    }
    
        for (let i = experienceOrbs.length - 1; i >= 0; i--) {
        const orb = experienceOrbs[i];
        const dist = Math.hypot(orb.x - (player.x + player.width/2), orb.y - (player.y + player.height/2));

        if (player.hasMagnet && dist < 150) {
            const angle = Math.atan2((player.y + player.height/2) - orb.y, (player.x + player.width/2) - orb.x);
            orb.x += Math.cos(angle) * 3;
            orb.y += Math.sin(angle) * 3;
        }

        if (dist < 30) {
            player.exp += 25;
            experienceOrbs.splice(i, 1);
            if (player.exp >= player.expToNextLevel) {
                levelUp();
            }
        }
    }
}

function levelUp() {
    if (level + 1 === BOSS_LEVEL) {
        player.health = player.maxHealth;
        level++;
        gameState = 'playing';
        setTimeout(createBoss, 2000);
        return;
    }
    level++;
    player.exp -= player.expToNextLevel;
    player.expToNextLevel = Math.floor(player.expToNextLevel * 1.5);
    player.health = player.maxHealth;
    gameState = 'levelUp';
    
    currentUpgrades = [];
    const poolCopy = [...upgradePool];
    for (let i = 0; i < 3 && poolCopy.length > 0; i++) {
        const randIndex = Math.floor(Math.random() * poolCopy.length);
        currentUpgrades.push(poolCopy.splice(randIndex, 1)[0]);
    }
}

function updateEnemiesAndBoss() {
    if (gameState === 'bossFight' && boss) {
        // 阶段转换：血量低于50%进入狂暴模式
        if (!boss.enraged && boss.health <= boss.maxHealth * 0.5) {
            boss.enraged = true;
            boss.phase = 2;
            // 狂暴时恢复一些血量
            boss.health += 300;
            // 产生爆炸效果
            for(let i=0; i<30; i++) {
                effects.push({
                    x: boss.x + (Math.random() - 0.5) * boss.width,
                    y: boss.y + (Math.random() - 0.5) * boss.height,
                    radius: 20 + Math.random() * 30,
                    duration: 40,
                    maxDuration: 40
                });
            }
        }
        
        // Boss移动 - 狂暴时移动更快
        const moveSpeed = boss.enraged ? 2.5 : 1.5;
        boss.x += moveSpeed * boss.moveDirection;
        if (boss.x > CANVAS_WIDTH - 100 || boss.x < 100) {
            boss.moveDirection *= -1;
        }
        
        // 召唤小怪
        boss.summonTimer--;
        if (boss.summonTimer <= 0) {
            const summonCount = boss.enraged ? 3 : 2;
            for(let i=0; i<summonCount; i++) {
                const side = Math.floor(Math.random() * 4);
                let x, y;
                switch(side) {
                    case 0: x = Math.random() * CANVAS_WIDTH; y = -30; break;
                    case 1: x = CANVAS_WIDTH + 30; y = Math.random() * CANVAS_HEIGHT; break;
                    case 2: x = Math.random() * CANVAS_WIDTH; y = CANVAS_HEIGHT + 30; break;
                    case 3: x = -30; y = Math.random() * CANVAS_HEIGHT; break;
                }
                // 召唤番茄小兵
                enemies.push({ 
                    type: 'tomato', x, y, radius: 15, color: 'red', 
                    speed: boss.enraged ? 3 : 2, 
                    health: 20 * level, damage: 10 
                });
            }
            boss.summonTimer = boss.enraged ? 200 : 300;
        }
        
        // 攻击逻辑
        boss.attackTimer--;
        boss.spinAttackTimer--;
        
        // 旋转攻击
        if (boss.spinAttackTimer > 0) {
            boss.spinAngle += 0.15;
            if (boss.spinAttackTimer % 5 === 0) {
                for(let i=0; i<8; i++) {
                    const angle = boss.spinAngle + (i * Math.PI / 4);
                    enemyProjectiles.push({ 
                        x: boss.x, y: boss.y, 
                        width: 8, height: 8, 
                        color: boss.enraged ? 'red' : 'darkgreen', 
                        speed: boss.enraged ? 6 : 4, 
                        dx: Math.cos(angle), dy: Math.sin(angle), 
                        angle: angle, damage: boss.enraged ? 12 : 8 
                    });
                }
            }
        }
        
        if (boss.attackTimer <= 0) {
            const patterns = boss.enraged ? 
                ['rain', 'shot', 'spin', 'laser'] : 
                ['rain', 'shot', 'spin'];
            const currentPattern = patterns[Math.floor(Math.random() * patterns.length)];
            
            switch(currentPattern) {
                case 'rain':
                    // 蔬菜雨 - 狂暴时更密集
                    const rainCount = boss.enraged ? 30 : 20;
                    for(let i=0; i<rainCount; i++) {
                        enemyProjectiles.push({ 
                            x: Math.random() * CANVAS_WIDTH, y: -20, 
                            width: 5, height: 15, 
                            color: boss.enraged ? 'red' : 'green', 
                            speed: 3 + Math.random() * 3, 
                            dx: (Math.random() - 0.5) * 0.5, dy: 1, 
                            angle: Math.PI/2, damage: boss.enraged ? 12 : 8 
                        });
                    }
                    boss.attackTimer = boss.enraged ? 120 : 180;
                    break;
                    
                case 'shot':
                    // 追踪射击 - 狂暴时发射更多
                    const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
                    const shotCount = boss.enraged ? 5 : 3;
                    const spread = boss.enraged ? 0.3 : 0.2;
                    for(let i=-(shotCount-1)/2; i<=(shotCount-1)/2; i++) {
                         enemyProjectiles.push({ 
                             x: boss.x, y: boss.y, 
                             width: 10, height: 10, 
                             color: boss.enraged ? 'darkred' : 'darkgreen', 
                             speed: boss.enraged ? 7 : 5, 
                             dx: Math.cos(angle + i*spread), 
                             dy: Math.sin(angle + i*spread), 
                             angle: angle, damage: boss.enraged ? 20 : 15 
                         });
                    }
                    boss.attackTimer = boss.enraged ? 80 : 120;
                    break;
                    
                case 'spin':
                    // 开始旋转攻击
                    boss.spinAttackTimer = boss.enraged ? 120 : 90;
                    boss.attackTimer = boss.enraged ? 180 : 240;
                    break;
                    
                case 'laser':
                    // 激光预警 + 发射
                    effects.push({
                        x: boss.x, y: boss.y + 50,
                        radius: 20,
                        duration: 60,
                        maxDuration: 60,
                        isLaser: true,
                        targetX: player.x,
                        targetY: player.y
                    });
                    setTimeout(() => {
                        if(gameState === 'bossFight' && boss) {
                            const laserAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
                            for(let d=0; d<600; d+=20) {
                                enemyProjectiles.push({
                                    x: boss.x + Math.cos(laserAngle) * d,
                                    y: boss.y + Math.sin(laserAngle) * d,
                                    width: 15, height: 15,
                                    color: 'purple',
                                    speed: 0, dx: 0, dy: 0,
                                    angle: 0, damage: 30,
                                    isLaser: true,
                                    life: 30
                                });
                            }
                        }
                    }, 1000);
                    boss.attackTimer = 200;
                    break;
            }
        }
        return;
    }
    
    enemies.forEach(e => {
        if (e.slowed) {
            e.speed = e.originalSpeed / 2;
            e.slowTimer--;
            if (e.slowTimer <= 0) {
                e.slowed = false;
                e.speed = e.originalSpeed;
            }
        }
        const angle = Math.atan2(player.y - e.y, player.x - e.x);
        const dist = Math.hypot(player.y - e.y, player.x - e.x);
        switch(e.type) {
            case 'tomato': e.x += Math.cos(angle) * e.speed; e.y += Math.sin(angle) * e.speed; break;
            case 'carrot':
                if(dist > 200) { e.x += Math.cos(angle) * e.speed; e.y += Math.sin(angle) * e.speed; }
                e.attackCooldown--;
                if (e.attackCooldown <= 0) {
                    enemyProjectiles.push({x: e.x, y: e.y, width: 5, height: 10, color: 'green', speed: 4, dx: Math.cos(angle), dy: Math.sin(angle), angle: angle + Math.PI/2, damage: 5});
                    e.attackCooldown = 120;
                }
                break;
            case 'potato':
                if(dist < e.blastRadius && !e.arming) { e.arming = true; e.armTimer = e.armTime; }
                if(e.arming) {
                    e.armTimer--;
                    if(e.armTimer <= 0) {
                        effects.push({x: e.x, y: e.y, radius: e.blastRadius, duration: 20, maxDuration: 20});
                        if(Math.hypot(player.x - e.x, player.y - e.y) < e.blastRadius) {
                            if(!player.shieldActive) player.health -= e.damage;
                            if (player.health <= 0) { player.health = 0; gameState = 'gameOver'; }
                        }
                        const index = enemies.indexOf(e);
                        enemies.splice(index, 1);
                    }
                }
                break;
        }

        if (e.x < 0) e.x = CANVAS_WIDTH;
        if (e.x > CANVAS_WIDTH) e.x = 0;
        if (e.y < 0) e.y = CANVAS_HEIGHT;
        if (e.y > CANVAS_HEIGHT) e.y = 0;
    });
}

function updateProjectiles() {
    [projectiles, enemyProjectiles].forEach(projArray => {
        for (let i = projArray.length - 1; i >= 0; i--) {
            const p = projArray[i];
            
            // 激光有生命周期而不是移动
            if (p.isLaser) {
                p.life--;
                if (p.life <= 0) {
                    projArray.splice(i, 1);
                }
                continue;
            }
            
            p.x += p.dx * p.speed;
            p.y += p.dy * p.speed;
            if (p.x < 0) p.x = CANVAS_WIDTH;
            if (p.x > CANVAS_WIDTH) p.x = 0;
            if (p.y < 0) p.y = CANVAS_HEIGHT;
            if (p.y > CANVAS_HEIGHT) p.y = 0;
        }
    });
}

function handleCollisions() {
    for (let pIndex = projectiles.length - 1; pIndex >= 0; pIndex--) {
        const p = projectiles[pIndex];
        let hit = false;
        if (gameState === 'bossFight' && boss) {
            if (p.x > boss.x - boss.width/2 && p.x < boss.x + boss.width/2 && p.y > boss.y - boss.height/2 && p.y < boss.y + boss.height/2) {
                boss.health -= p.damage;
                score += p.damage;
                hit = true;
                if(boss.health <= 0) gameState = 'gameWon';
            }
        } else {
            for (let eIndex = enemies.length - 1; eIndex >= 0; eIndex--) {
                const enemy = enemies[eIndex];
                const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
                if (dist < (enemy.radius || enemy.size / 2) + p.radius) {
                    hit = true;
                    if (player.hasIce) {
                        enemy.slowed = true;
                        enemy.slowTimer = 180; // 3 seconds at 60fps
                    }
                    if (p.isExplosive) {
                        effects.push({x: p.x, y: p.y, radius: player.explosionRadius, duration: 20, maxDuration: 20});
                        enemies.forEach(e => {
                            if (Math.hypot(e.x - p.x, e.y - p.y) < player.explosionRadius) {
                                e.health -= p.damage;
                            }
                        });
                    } else {
                        enemy.health -= p.damage;
                    }
                    break;
                }
            }
        }
        if(hit) projectiles.splice(pIndex, 1);
    }

    for (let eIndex = enemies.length - 1; eIndex >= 0; eIndex--) {
        const enemy = enemies[eIndex];
        if (enemy.health <= 0) {
            createExperienceOrb(enemy.x, enemy.y);
            enemies.splice(eIndex, 1);
            score += 10;
        }
    }
    
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const p = enemyProjectiles[i];
        if (player.shieldActive) {
            if(Math.hypot(p.x - (player.x + player.width/2), p.y - (player.y + player.height/2)) < player.width) {
                p.dx *= -1; p.dy *= -1;
                projectiles.push({x:p.x, y:p.y, radius:5, color:'purple', speed:p.speed, dx:p.dx, dy:p.dy, damage: player.projectileDamage});
                enemyProjectiles.splice(i,1);
                continue;
            }
        }
        if(p.x > player.x && p.x < player.x + player.width && p.y > player.y && p.y < player.y + player.height) {
             player.health -= p.damage;
             enemyProjectiles.splice(i,1);
             if (player.health <= 0) { player.health = 0; gameState = 'gameOver'; }
        }
    }

    if (!player.shieldActive) {
        enemies.forEach(enemy => {
            if (Math.hypot(enemy.x - (player.x + player.width/2), enemy.y - (player.y + player.height/2)) < (enemy.radius || enemy.size/2) + player.width / 2) {
                player.health -= enemy.damage;
                if (player.health <= 0) { player.health = 0; gameState = 'gameOver'; }
            }
        });
    }
}

function spawnEnemies() {
    if (level >= BOSS_LEVEL || gameState === 'bossFight') return;
    enemySpawnTimer--;
    if (enemySpawnTimer <= 0) {
        createEnemy();
        enemySpawnTimer = enemySpawnInterval;
    }
}

function update() {
    updatePlayer(); updateEnemiesAndBoss(); updateProjectiles(); handleCollisions(); spawnEnemies();
}

function draw() {
    clearCanvas();
    drawExperienceOrbs();
    drawPlayer();
    if(player.hasClone) drawClone();
    if(gameState === 'bossFight') drawBoss();
    drawEnemies();
    drawProjectiles();
    drawEffects();
    drawUI();
}

function gameLoop() {
    if (gameState === 'playing' || gameState === 'bossFight') { update(); }
    draw();
    switch(gameState) {
        case 'levelUp': drawLevelUpScreen(); break;
        case 'gameOver': drawGameOver(); break;
        case 'gameWon': drawGameWon(); break;
    }
    requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---
function handleMouseClick(event) {
    if (gameState !== 'levelUp') return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    currentUpgrades.forEach((upgrade, index) => {
        const cardX = 150 + index * 200, cardY = 200;
        if (x > cardX && x < cardX + 150 && y > cardY && y < cardY + 200) {
            upgrade.apply();
            gameState = 'playing';
        }
    });
}

function movePlayer() {
    let dx = 0, dy = 0;
    if (keys.w) dy--; if (keys.s) dy++; if (keys.a) dx--; if (keys.d) dx++;
    const length = Math.hypot(dx, dy);
    if(length > 0) {
        player.dx = (dx / length) * player.speed;
        player.dy = (dy / length) * player.speed;
    } else {
        player.dx = 0; player.dy = 0;
    }
}

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if ((gameState === 'gameOver' || gameState === 'gameWon') && e.key === 'Enter') { resetGame(); return; }
    if (keys.hasOwnProperty(key) && gameState !== 'levelUp') { keys[key] = true; movePlayer(); }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) { keys[key] = false; movePlayer(); }
});

canvas.addEventListener('click', handleMouseClick);

// Start the game
resetGame();
gameLoop();
console.log("布丁勇者大冒险 - 完整修复版已启动!");
