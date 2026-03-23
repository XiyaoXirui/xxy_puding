const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
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
    shieldActive: false, shieldDuration: 60, shieldCooldown: 600, shieldTimer: 0,
    exp: 0, expToNextLevel: 100,
};

// --- Keyboard input state ---
const keys = { w: false, a: false, s: false, d: false, ' ': false };

// --- Game Loop Globals ---
let enemySpawnTimer = 0;
const enemySpawnInterval = 100;

// --- Upgrade Definitions ---
const upgradePool = [
    { icon: '🔴', title: '辣椒 (Chili)', description: '攻击速度 +15%', apply: () => player.attackRate = Math.max(5, player.attackRate * 0.85) },
    { icon: '🟢', title: '菠菜 (Spinach)', description: '最大生命值 +20, 并回满', apply: () => { player.maxHealth += 20; player.health = player.maxHealth; } },
    { icon: '🟡', title: '闪电 (Lightning)', description: '子弹伤害 +20%', apply: () => player.projectileDamage = Math.ceil(player.projectileDamage * 1.2) },
    { icon: '👟', title: '跑鞋 (Shoes)', description: '移动速度 +10%', apply: () => player.speed *= 1.1 },
    { icon: '🛡️', title: '硬壳 (Hard Shell)', description: '护盾冷却 -15%', apply: () => player.shieldCooldown *= 0.85 },
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
        ctx.fillStyle = `rgba(255, 100, 0, ${effect.duration / effect.maxDuration * 0.8})`;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawBoss() {
    if (!boss) return;
    ctx.fillStyle = 'darkgreen';
    ctx.beginPath();
    ctx.roundRect(boss.x - boss.width/2, boss.y - boss.height/2, boss.width, boss.height, 20);
    ctx.fill();
    ctx.fillStyle = 'green';
    ctx.beginPath();
    ctx.arc(boss.x - 40, boss.y - 30, 25, 0, Math.PI * 2);
    ctx.arc(boss.x + 40, boss.y - 30, 25, 0, Math.PI * 2);
    ctx.arc(boss.x, boss.y - 50, 30, 0, Math.PI * 2);
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
        ctx.fillStyle = 'grey'; ctx.fillRect(100, CANVAS_HEIGHT - 30, barWidth, 20);
        ctx.fillStyle = 'purple'; ctx.fillRect(100, CANVAS_HEIGHT - 30, (boss.health / boss.maxHealth) * barWidth, 20);
        ctx.strokeStyle = 'black'; ctx.strokeRect(100, CANVAS_HEIGHT - 30, barWidth, 20);
        ctx.fillStyle = 'white'; ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('西兰花巨人 (Broccoli Giant)', CANVAS_WIDTH/2, CANVAS_HEIGHT - 15);
        ctx.textAlign = 'left';
    }
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = 'white'; ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
    ctx.font = '30px sans-serif';
    ctx.fillText('Final Score: ' + score, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    ctx.font = '20px sans-serif';
    ctx.fillText('Press Enter to Restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);
    ctx.textAlign = 'left';
}

function drawGameWon() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = 'darkblue'; ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOU WON!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
    ctx.font = '30px sans-serif';
    ctx.fillText('你找回了世界的“甜味素”!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
    ctx.font = '20px sans-serif';
    ctx.fillText('Press Enter to Play Again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);
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
         enemies.push({ type: 'tomato', x, y, radius: 15, color: 'red', speed: 2, health: 10 * level, damage: 10 });
    } else if (rand < 0.85) {
        enemies.push({ type: 'carrot', x, y, size: 20, color: 'orange', speed: 1, health: 15 * level, damage: 0, attackCooldown: 120 });
    } else {
        enemies.push({ type: 'potato', x, y, size: 25, color: '#8B4513', health: 30 * level, arming: false, armTime: 180, armTimer: 0, blastRadius: 100, damage: 25 });
    }
}

function createExperienceOrb(x, y) { experienceOrbs.push({ x, y, radius: 5 }); }

function createBoss() {
    boss = {
        x: CANVAS_WIDTH / 2, y: 150,
        width: 150, height: 120,
        maxHealth: 1500, health: 1500,
        attackTimer: 0, attackPattern: 'rain', moveDirection: 1,
    };
    gameState = 'bossFight';
    enemies = [];
}

// --- Game Logic ---
function resetGame() {
    player.maxHealth = 100; player.health = 100;
    player.speed = 4; player.attackRate = 30; player.projectileDamage = 10;
    player.x = CANVAS_WIDTH / 2; player.y = CANVAS_HEIGHT / 2;
    player.shieldTimer = 0; player.shieldActive = false;
    player.exp = 0; player.expToNextLevel = 100;
    level = 1;
    enemies = []; projectiles = []; enemyProjectiles = []; experienceOrbs = []; effects = [];
    score = 0;
    boss = null;
    gameState = 'playing';
}

function updatePlayer() {
    player.x += player.dx; player.y += player.dy;
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > CANVAS_WIDTH) player.x = CANVAS_WIDTH - player.width;
    if (player.y < 0) player.y = 0;
    if (player.y + player.height > CANVAS_HEIGHT) player.y = CANVAS_HEIGHT - player.height;

    if (player.shieldTimer > 0) player.shieldTimer--;
    if (keys[' '] && player.shieldTimer <= 0) {
        player.shieldActive = true;
        player.shieldTimer = player.shieldCooldown;
        setTimeout(() => player.shieldActive = false, player.shieldDuration * 1000 / 60);
    }

    player.attackCooldown--;
    if (player.attackCooldown <= 0 && (enemies.length > 0 || boss)) {
        let target = null;
        if(boss) {
            target = boss;
        } else {
            target = enemies.reduce((c, e) => { let d = Math.hypot(e.x - player.x, e.y - player.y); return d < c.d ? { e, d } : c; }, { e: null, d: Infinity }).e;
        }
        
        if (target) {
            const angle = Math.atan2(target.y - player.y, target.x - player.x);
            projectiles.push({ x: player.x + player.width / 2, y: player.y + player.height / 2, radius: 5, color: 'rgba(255, 215, 0, 1)', speed: player.projectileSpeed, dx: Math.cos(angle), dy: Math.sin(angle), damage: player.projectileDamage });
            player.attackCooldown = player.attackRate;
        }
    }
    
    for (let i = experienceOrbs.length - 1; i >= 0; i--) {
        const orb = experienceOrbs[i];
        if (Math.hypot(orb.x - (player.x + player.width/2), orb.y - (player.y + player.height/2)) < 30) {
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
        boss.x += 1.5 * boss.moveDirection;
        if (boss.x > CANVAS_WIDTH - 100 || boss.x < 100) {
            boss.moveDirection *= -1;
        }
        boss.attackTimer--;
        if (boss.attackTimer <= 0) {
            if (boss.attackPattern === 'rain') {
                for(let i=0; i<20; i++) {
                    enemyProjectiles.push({ x: Math.random() * CANVAS_WIDTH, y: -20, width: 5, height: 15, color: 'green', speed: 3 + Math.random() * 2, dx: 0, dy: 1, angle: Math.PI/2, damage: 8 });
                }
                boss.attackTimer = 180;
                boss.attackPattern = 'shot';
            } else {
                const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
                for(let i=-1; i<=1; i++) {
                     enemyProjectiles.push({ x: boss.x, y: boss.y, width: 10, height: 10, color: 'darkgreen', speed: 5, dx: Math.cos(angle + i*0.2), dy: Math.sin(angle + i*0.2), angle: angle, damage: 15 });
                }
                boss.attackTimer = 120;
                boss.attackPattern = 'rain';
            }
        }
        return;
    }
    
    enemies.forEach(e => {
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
    });
}

function updateProjectiles() {
    [projectiles, enemyProjectiles].forEach(projArray => {
        for (let i = projArray.length - 1; i >= 0; i--) {
            const p = projArray[i];
            p.x += p.dx * p.speed;
            p.y += p.dy * p.speed;
            if (p.x < -10 || p.x > CANVAS_WIDTH + 10 || p.y < -10 || p.y > CANVAS_HEIGHT + 10) {
                projArray.splice(i, 1);
            }
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
                    enemy.health -= p.damage;
                    hit = true;
                    if(enemy.health <= 0){
                        createExperienceOrb(enemy.x, enemy.y);
                        enemies.splice(eIndex, 1);
                        score += 10;
                    }
                    break;
                }
            }
        }
        if(hit) projectiles.splice(pIndex, 1);
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
