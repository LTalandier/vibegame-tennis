const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// --- Game Constants (mirrored from game.js) ---
const PLAYER_SIZE = 5;
const BALL_SIZE = 5;
const PUNCH_POWER = 20; // Reduced from 30
const MAX_PUNCH_REACH = BALL_SIZE + PLAYER_SIZE * 6;
const MAX_SHOT_SPEED = 12.0; // Reduced from 20.0 to a more moderate value
const MIN_CHARGE_POWER = 1.0;
const CRITICAL_HIT_BONUS = 2.0; // Currently unused server-side, but here for future
const COURT_LENGTH = 500;
const STADIUM_WIDTH = 300;
const STADIUM_HEIGHT = 300 * 1.2;
const GRAVITY = 1.5; // Slightly increased from 1.0 for faster descent
const AIR_RESISTANCE = 0.998; // Increased air resistance slightly from 0.999
const WALL_MAX_HP = 100; // Increased from 100
const WALL_DAMAGE_FACTOR = 2; // Reduced from 5 - Multiplier for damage calculation based on ball speed
const WALL_MIN_BOUNCE = 0.4; // Increased from 0.1 - Minimum bounce factor for heavily damaged walls
const WALL_MAX_BOUNCE = 0.8; // Increased from 0.1 - Maximum bounce factor for healthy walls
const POINTS_TO_WIN = 3; // Number of points needed to win the game
// --- End Game Constants ---

// --- NEW: Multi-Court Constants ---
const TOTAL_COURTS = 3; // e.g., 3 courts: 0 (P1 final), 1 (middle), 2 (P2 final)
const MIDDLE_COURT_INDEX = Math.floor(TOTAL_COURTS / 2);
const WINS_NEEDED = Math.ceil(TOTAL_COURTS / 2); // Wins needed to win the game (break middle + opponent final wall)
// --- End Multi-Court Constants ---

// --- NEW: Private Game Management ---
const privateGames = new Map(); // Map to track private games by game ID
const randomQueue = []; // Queue of players waiting for random matches
const PRIVATE_GAME_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
// --- End Private Game Management ---

// --- Vector Math Helpers ---
function vecLength(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vecNormalize(v) {
    const len = vecLength(v);
    if (len === 0) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vecDistance(v1, v2) {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    const dz = v1.z - v2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vecSubtract(v1, v2) {
    return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
}

function vecAdd(v1, v2) {
    return { x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z };
}

function vecScale(v, scalar) {
    return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}
// --- End Vector Math Helpers ---

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files (index.html, game.js, etc.)
app.use(express.static(path.join(__dirname, '.'))); // Serve files from the root directory

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let players = {};
let ball = {
    position: { x: 0, y: -PLAYER_SIZE + BALL_SIZE + 50, z: 0 }, // Initial ball position (matching resetBall approx)
    velocity: { x: 0, y: 0, z: 0 }
};

// --- MODIFIED: Game State Variables ---
let gameState = {
    players: {},
    ball: ball, // Keep direct reference for physics updates
    currentCourtIndex: MIDDLE_COURT_INDEX, // Start in the middle court
    walls: { // Represents health of walls on the CURRENT court
        player1: WALL_MAX_HP, // Player 1 defends negative Z wall relative to current court center
        player2: WALL_MAX_HP  // Player 2 defends positive Z wall relative to current court center
    },
    player1Wins: 0, // How many walls Player 1 (attacker) has broken
    player2Wins: 0, // How many walls Player 2 (attacker) has broken
    gameOver: false,
    winner: null
};
// --- End MODIFIED: Game State Variables ---

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle join method detection (random or private)
    socket.on('join_game', (data) => {
        if (data && data.gameId) {
            // Join private game
            joinPrivateGame(socket, data.gameId);
        } else {
            // Join random game
            joinRandomGame(socket);
        }
    });

    // Handle private game creation request
    socket.on('create_private_game', () => {
        createPrivateGame(socket);
    });

    // Assign player number (1 or 2)
    let playerNumber;
    const connectedPlayerIds = Object.keys(gameState.players);
    if (connectedPlayerIds.length === 0) {
        playerNumber = 1;
    } else if (connectedPlayerIds.length === 1) {
        playerNumber = 2;
    } else {
        // Spectator or game full
        socket.emit('game_full');
        console.log('Game is full. New connection rejected.');
        socket.disconnect(true);
        return;
    }

    // Initialize player state
    gameState.players[socket.id] = {
        id: socket.id,
        number: playerNumber,
        // Position relative to the STARTING (middle) court's center
        position: { x: 0, y: PLAYER_SIZE * 2, z: calculatePlayerStartZ(playerNumber, MIDDLE_COURT_INDEX) },
        velocity: { x: 0, y: 0, z: 0 },
        // Add other relevant player states from game.js (like charge, punch state etc.)
        isCharging: false,
        chargePower: 1.0
    };

    console.log(`Player ${playerNumber} assigned to ${socket.id}`);
    socket.emit('player_assignment', { playerId: socket.id, playerNumber: playerNumber });

    // Send initial game state to the new player
    socket.emit('initial_state', {
        playerId: socket.id,
        playerNumber: playerNumber,
        gameState: gameState // Send current players, ball, walls
    });

    // Notify other players about the new player
    socket.broadcast.emit('new_player', gameState.players[socket.id]);

    // Handle player movement updates
    socket.on('player_move', (data) => {
        const player = gameState.players[socket.id];
        if (player) {
            player.position = data.position;
            player.velocity = data.velocity;
            // Broadcast update to other players (Consider only broadcasting changes)
            // Server loop will broadcast combined state update anyway
        }
    });

    // Handle player charge start
    socket.on('charge_start', () => {
        const player = gameState.players[socket.id];
        if (player) {
            player.isCharging = true;
            // Notify others (optional, depends if opponent needs to see charge)
            // Server loop will broadcast combined state update
        }
    });

    // Handle player charge update (sent periodically while charging)
    socket.on('charge_update', (data) => {
        const player = gameState.players[socket.id];
        if (player && player.isCharging) {
            player.chargePower = data.chargePower;
            // Broadcast charge power? Maybe not necessary unless opponent needs visual cue.
        }
    });

     // Handle player punch action
     socket.on('punch', (data) => {
        const player = gameState.players[socket.id];
        if (player) {
            player.isCharging = false; // Stop charging on punch
            const chargePower = data.chargePower || MIN_CHARGE_POWER; // Use chargePower sent from client
            player.chargePower = MIN_CHARGE_POWER; // Reset server charge state

            console.log(`Player ${player.number} (${socket.id}) punched with power ${chargePower}`);

            // --- Server-side Hit Detection & Ball Physics --- //
            const distanceToBall = vecDistance(player.position, ball.position);

            // Check if the punch was within reach
            if (distanceToBall < MAX_PUNCH_REACH) {
                console.log(`Punch hit the ball! Distance: ${distanceToBall}`);

                // Calculate direction from player to ball
                const hitDirection = vecNormalize(vecSubtract(ball.position, player.position));

                // Add some of player's velocity influence (simplified)
                // let playerVelInfluence = vecScale(player.velocity, 0.5);
                // ball.velocity = vecAdd(ball.velocity, playerVelInfluence);

                // Calculate new speed based on charge power
                const currentSpeed = vecLength(ball.velocity);
                // More moderate hit calculation
                let newSpeed = Math.min(MAX_SHOT_SPEED * 1.8, MAX_SHOT_SPEED + (currentSpeed * 0.5)); // Reduced from 3.0 and 0.8
                const powerMultiplier = (chargePower / MIN_CHARGE_POWER) * 1.8; // Reduced from 3.0
                newSpeed *= powerMultiplier; // Apply charge multiplier
                newSpeed = Math.min(newSpeed, MAX_SHOT_SPEED * 2.0); // Reduced cap from 2.5

                console.log(`Ball new speed: ${newSpeed.toFixed(2)} (Multiplier: ${powerMultiplier.toFixed(2)})`);

                // Higher direction influence for more control
                const directionInfluence = 0.95;
                let newVelocity = vecAdd(
                    vecScale(ball.velocity, 1 - directionInfluence),
                    vecScale(hitDirection, newSpeed * directionInfluence)
                );

                // Normalize and scale to the final speed
                newVelocity = vecScale(vecNormalize(newVelocity), newSpeed);

                // Add a slight upward component if ball is low
                if (ball.position.y < STADIUM_HEIGHT * 0.3) {
                    newVelocity.y += newSpeed * 0.4;
                    newVelocity = vecScale(vecNormalize(newVelocity), newSpeed); // Re-normalize if Y added
                }

                // Update authoritative ball velocity
                ball.velocity = newVelocity;

                // Move ball slightly out of player collision radius immediately (optional)
                const overlap = (PLAYER_SIZE + BALL_SIZE) - distanceToBall;
                if (overlap > 0) {
                    ball.position = vecAdd(ball.position, vecScale(hitDirection, overlap + 0.1));
                }

            } else {
                console.log(`Punch missed. Distance: ${distanceToBall}`);
            }
            // --- End Server-side Hit Detection --- //

            // Broadcast punch animation event regardless of hit (for visual feedback)
            io.emit('player_punched', { id: socket.id, chargePower: chargePower }); // Send chargePower for potential effects
        }
    });

    // Handle game restart request
    socket.on('restart_game', () => {
        console.log(`Player ${socket.id} requested game restart`);
        
        // Only allow restart if game is over
        if (gameState.gameOver) {
            console.log("Restarting game upon player request");
            resetFullGame(); // Reset the full game
            io.emit('game_reset', gameState); // Broadcast the reset state to all players
        } else {
            console.log("Restart request ignored - game is not over");
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove from random queue if present
        const queueIndex = randomQueue.indexOf(socket.id);
        if (queueIndex !== -1) {
            randomQueue.splice(queueIndex, 1);
        }
        
        // Check if part of a private game
        let privateGameId = null;
        for (const [gameId, game] of privateGames.entries()) {
            if (game.players.has(socket.id)) {
                privateGameId = gameId;
                game.players.delete(socket.id);
                
                // Notify remaining player
                if (game.players.size > 0) {
                    const remainingPlayerId = Array.from(game.players.keys())[0];
                    io.to(remainingPlayerId).emit('opponent_left', { message: 'Your opponent left the game' });
                }
                
                // If no players left, clean up the game
                if (game.players.size === 0) {
                    privateGames.delete(gameId);
                }
                break;
            }
        }
        
        const player = gameState.players[socket.id];
        if (player) {
            // Notify other players
            socket.broadcast.emit('player_disconnected', socket.id);
            // Remove player from state
            delete gameState.players[socket.id];
            console.log('Remaining players:', gameState.players);

            // Reset ball and walls if game should end/reset
            // --- MODIFIED: Reset full game if a player leaves ---
            if (Object.keys(gameState.players).length < 2 && !gameState.gameOver) {
                // Reset game state if not enough players and game wasn't already over
                console.log("Player disconnected, resetting game state...");
                resetFullGame(); // Use the full reset function
                io.emit('game_reset', gameState); // Notify remaining player(s)
            }
            // --- End MODIFIED ---
        }
    });
});

// --- NEW Helper: Calculate Player Starting Z based on court ---
function calculatePlayerStartZ(playerNumber, courtIndex) {
    const courtZOffset = (courtIndex - MIDDLE_COURT_INDEX) * COURT_LENGTH;
    const playerRelativeZ = (playerNumber === 1) ? -COURT_LENGTH / 2 + PLAYER_SIZE * 3 : COURT_LENGTH / 2 - PLAYER_SIZE * 3;
    const finalZ = courtZOffset + playerRelativeZ;
    
    // Debug this calculation when called from triggerCourtTransition
    const stack = new Error().stack;
    if (stack.includes('triggerCourtTransition')) {
        console.log(`calculatePlayerStartZ for Player ${playerNumber}, Court ${courtIndex}:`);
        console.log(`  MIDDLE_COURT_INDEX = ${MIDDLE_COURT_INDEX}`);
        console.log(`  courtZOffset = (${courtIndex} - ${MIDDLE_COURT_INDEX}) * ${COURT_LENGTH} = ${courtZOffset}`);
        console.log(`  playerRelativeZ = ${playerRelativeZ}`);
        console.log(`  final Z position = ${finalZ}`);
    }
    
    return finalZ;
}
// --- End NEW Helper ---

// --- MODIFIED: Function to reset game state (now full reset) ---
function resetFullGame() {
    console.log("Resetting FULL game state");
    gameState.currentCourtIndex = MIDDLE_COURT_INDEX;
    const startZOffset = (gameState.currentCourtIndex - MIDDLE_COURT_INDEX) * COURT_LENGTH; // Should be 0

    ball.position = { x: 0, y: -PLAYER_SIZE + BALL_SIZE + 50, z: startZOffset }; // Center of middle court
    ball.velocity = { x: 0, y: 0, z: 0 };
    gameState.walls = { // Reset walls for the starting court
        player1: WALL_MAX_HP,
        player2: WALL_MAX_HP
    };
    gameState.player1Wins = 0;
    gameState.player2Wins = 0;
    gameState.gameOver = false;
    gameState.winner = null;

    // Reset player positions/states to the middle court
    for (const id in gameState.players) {
        const player = gameState.players[id];
        player.position = { x: 0, y: PLAYER_SIZE * 2, z: calculatePlayerStartZ(player.number, gameState.currentCourtIndex) };
        player.velocity = { x: 0, y: 0, z: 0 };
        player.isCharging = false;
        player.chargePower = MIN_CHARGE_POWER;
    }
}
// --- End MODIFIED resetGameState ---

// Basic Game Loop (runs on server)
const GAME_TICK_RATE = 1000 / 60; // 60 updates per second
let lastUpdateTime = Date.now();

function gameLoop() {
    const now = Date.now();
    const deltaTime = (now - lastUpdateTime) / 1000.0; // Delta time in seconds
    lastUpdateTime = now;

    // Only run physics if 2 players are present
    if (Object.keys(gameState.players).length < 2) {
        return; // Wait for players
    }

    // --- Server-side Game Logic --- //

    // 1. Update Ball Physics (using gameState.ball)
    const ballRef = gameState.ball; // Use reference
    const courtZOffset = (gameState.currentCourtIndex - MIDDLE_COURT_INDEX) * COURT_LENGTH; // Calculate current offset
    
    // Apply fixed gravity increment instead of deltaTime
    ballRef.velocity.y -= GRAVITY;
    
    // Apply air resistance directly per tick
    ballRef.velocity.x *= AIR_RESISTANCE;
    ballRef.velocity.y *= AIR_RESISTANCE;
    ballRef.velocity.z *= AIR_RESISTANCE;

    // Use fixed position updates instead of deltaTime
    ballRef.position.x += ballRef.velocity.x;
    ballRef.position.y += ballRef.velocity.y;
    ballRef.position.z += ballRef.velocity.z;

    // 2. Handle Ball Collisions (Walls, Floor, Ceiling)
    // Floor collision
    if (ballRef.position.y < -PLAYER_SIZE + BALL_SIZE) {
        ballRef.position.y = -PLAYER_SIZE + BALL_SIZE;
        ballRef.velocity.y *= -0.92; // Reduced from 0.99
        ballRef.velocity.x *= 0.95; // Reduced from 0.99
        ballRef.velocity.z *= 0.95; // Reduced from 0.99
    }
     // Ceiling collision
    if (ballRef.position.y > STADIUM_HEIGHT - BALL_SIZE) {
        ballRef.position.y = STADIUM_HEIGHT - BALL_SIZE;
        ballRef.velocity.y *= -0.92; // Reduced from 0.99
    }
    // Side wall collisions
    if (ballRef.position.x < -STADIUM_WIDTH / 2 + BALL_SIZE) {
        ballRef.position.x = -STADIUM_WIDTH / 2 + BALL_SIZE;
        ballRef.velocity.x *= -0.92; // Reduced from 0.99
    }
    if (ballRef.position.x > STADIUM_WIDTH / 2 - BALL_SIZE) {
        ballRef.position.x = STADIUM_WIDTH / 2 - BALL_SIZE;
        ballRef.velocity.x *= -0.92; // Reduced from 0.99
    }
    // --- MODIFIED: Back wall collisions (relative to current court) ---
    const player1WallZ = courtZOffset - COURT_LENGTH / 2; // Wall at negative Z end of the current court
    const player2WallZ = courtZOffset + COURT_LENGTH / 2; // Wall at positive Z end of the current court

    // Player 1's Wall (Negative Z relative to court center)
    if (ballRef.position.z < player1WallZ + BALL_SIZE) {
        const hitSpeed = vecLength(ballRef.velocity);
        ballRef.position.z = player1WallZ + BALL_SIZE;
        handleServerWallHit('player1', hitSpeed, ballRef); // Player 1 DEFENDS this wall
    }
    // Player 2's Wall (Positive Z relative to court center)
    else if (ballRef.position.z > player2WallZ - BALL_SIZE) {
        const hitSpeed = vecLength(ballRef.velocity);
        ballRef.position.z = player2WallZ - BALL_SIZE;
        handleServerWallHit('player2', hitSpeed, ballRef); // Player 2 DEFENDS this wall
    }
    // --- End MODIFIED Back wall collisions ---

    // 3. Broadcast updated state periodically
    // Send the entire gameState object
    io.emit('game_state_update', gameState);
}

// Start the game loop
setInterval(gameLoop, GAME_TICK_RATE);

// --- MODIFIED: Handle wall hit logic on server for multi-court ---
function handleServerWallHit(wallOwner, ballSpeed, ballRef) {
    // wallOwner refers to the DEFENDING player (player1 defends neg Z wall, player2 defends pos Z wall)
    let wallHealth = gameState.walls[wallOwner];
    if (wallHealth <= 0 || gameState.gameOver) return; // Wall already broken or game over

    // Calculate damage
    const damage = Math.max(1, Math.ceil(ballSpeed * WALL_DAMAGE_FACTOR)); // Ensure at least 1 damage
    wallHealth -= damage;
    gameState.walls[wallOwner] = Math.max(0, wallHealth); // Update state, clamp at 0

    console.log(`${wallOwner}'s wall hit! Damage: ${damage}, Health: ${gameState.walls[wallOwner]}`);

    // Emit wall hit event for client effects
    io.emit('wall_hit', { wallOwner: wallOwner, damage: damage, position: ballRef.position });

    // Calculate bounce factor based on remaining health
    const healthRatio = Math.max(0, wallHealth) / WALL_MAX_HP;
    const dynamicBounceFactor = WALL_MIN_BOUNCE + (healthRatio * (WALL_MAX_BOUNCE - WALL_MIN_BOUNCE));

    // Bounce the ball
    ballRef.velocity.z *= -dynamicBounceFactor;
    // Add slight randomness on bounce (optional)
    ballRef.velocity.x += (Math.random() - 0.5) * 0.1 * ballSpeed;
    ballRef.velocity.y += Math.random() * 0.1 * ballSpeed;

    // Check for wall break
    if (gameState.walls[wallOwner] <= 0) {
        console.log(`\n==== WALL BREAK DEBUG ====`);
        console.log(`${wallOwner}'s wall broken on court ${gameState.currentCourtIndex}!`);
        console.log(`Current ball position: x=${ballRef.position.x.toFixed(2)}, y=${ballRef.position.y.toFixed(2)}, z=${ballRef.position.z.toFixed(2)}`);
        
        for (const id in gameState.players) {
            const player = gameState.players[id];
            console.log(`Player ${player.number} at wall break: x=${player.position.x.toFixed(2)}, y=${player.position.y.toFixed(2)}, z=${player.position.z.toFixed(2)}`);
        }
        
        io.emit('wall_broken', { wallOwner: wallOwner, courtIndex: gameState.currentCourtIndex, position: ballRef.position }); // Include courtIndex

        // Determine who broke the wall (the attacker) and update wins
        const attackerPlayerNum = wallOwner === 'player1' ? 2 : 1; // If P1's wall broke, P2 attacked successfully
        let nextCourtIndex = gameState.currentCourtIndex;
        let gameShouldEnd = false;
        let winnerPlayerNum = null;

        if (attackerPlayerNum === 1) { // Player 1 broke Player 2's wall
            gameState.player1Wins++;
            nextCourtIndex++; // Move towards player 2's final court (index 0)
            console.log(`Player 1 wins round ${gameState.player1Wins}. Moving to court ${nextCourtIndex}`);
            if (gameState.player1Wins >= WINS_NEEDED) {
                 gameShouldEnd = true;
                 winnerPlayerNum = 1;
            }
        } else { // Player 2 broke Player 1's wall
            gameState.player2Wins++;
            nextCourtIndex--; // Move towards player 1's final court (index TOTAL_COURTS - 1)
            console.log(`Player 2 wins round ${gameState.player2Wins}. Moving to court ${nextCourtIndex}`);
            if (gameState.player2Wins >= WINS_NEEDED) {
                 gameShouldEnd = true;
                 winnerPlayerNum = 2;
            }
        }
        console.log(`Next court index will be: ${nextCourtIndex}`);
        console.log(`============================\n`);

        // --- Check Win Condition ---
        if (gameShouldEnd) {
            gameState.gameOver = true;
            gameState.winner = `player${winnerPlayerNum}`; // Assign winner correctly

            console.log(`Game over! ${gameState.winner} wins!`);

            // Before emitting game_over, make sure we have all data needed for the UI
            let finalScores = {
                player1: gameState.player1Wins,
                player2: gameState.player2Wins
            };

            // Emit game over event with complete information
            io.emit('game_over', {
                winner: gameState.winner,
                scores: finalScores,
                player1Wins: gameState.player1Wins,
                player2Wins: gameState.player2Wins
            });

            // Game will remain in game over state until manually reset
            // No automatic reset here
        } else {
            // --- Trigger Court Transition ---
            console.log(`Transitioning to court ${nextCourtIndex}`);
            triggerCourtTransition(nextCourtIndex);
             // The transition function will emit the updated state
        }
        // --- End Win Condition Check / Transition ---
    }
}
// --- End MODIFIED handleServerWallHit ---

// --- NEW: Function to handle court transitions ---
function triggerCourtTransition(newCourtIndex) {
    // --- START DEBUG LOGGING ---
    console.log("\n==== TRANSITION DEBUG - BEFORE ====");
    console.log(`Current court: ${gameState.currentCourtIndex}, Transitioning to: ${newCourtIndex}`);
    console.log(`Ball position before: x=${ball.position.x.toFixed(2)}, y=${ball.position.y.toFixed(2)}, z=${ball.position.z.toFixed(2)}`);
 
    // Log each player's position
    for (const id in gameState.players) {
        const player = gameState.players[id];
        console.log(`Player ${player.number} before: x=${player.position.x.toFixed(2)}, y=${player.position.y.toFixed(2)}, z=${player.position.z.toFixed(2)}`);
    }
    // --- END DEBUG LOGGING ---
 
    // Get reference to current court index before updating it
    const oldCourtIndex = gameState.currentCourtIndex;
 
    // Update the current court index
    gameState.currentCourtIndex = newCourtIndex;
    const newCourtZOffset = (newCourtIndex - MIDDLE_COURT_INDEX) * COURT_LENGTH;

    // Reset walls for the new court
    gameState.walls.player1 = WALL_MAX_HP;
    gameState.walls.player2 = WALL_MAX_HP;

    // --- MODIFIED: Determine which wall was broken based on court index change ---
    // If going to a lower index court (e.g., 1->0), the negative Z wall (Player 1's) was broken
    // If going to a higher index court (e.g., 1->2), the positive Z wall (Player 2's) was broken
    const negativeWallBroken = newCourtIndex < oldCourtIndex;
    const positiveWallBroken = newCourtIndex > oldCourtIndex;
    
    console.log(`Wall broken: ${negativeWallBroken ? 'Negative Z wall (Player 1 side)' : positiveWallBroken ? 'Positive Z wall (Player 2 side)' : 'Unknown'}`);

    // --- MODIFIED: Reset ball to the center of the new court ---
    ball.position = {
        x: 0,
        y: -PLAYER_SIZE + BALL_SIZE + 50, // Start slightly above the floor
        z: newCourtZOffset // Center of the new court
    };
    console.log(`Ball reset to center of court ${newCourtIndex} at z=${ball.position.z.toFixed(2)}`);
    // --- End Ball Reset Modification ---
 
    // Reset ball velocity
    ball.velocity = { x: 0, y: 0, z: 0 };

    // --- MODIFIED: Position players based on which wall was broken ---
    if (negativeWallBroken) {
        // Negative Z wall was broken (Player 1's wall)
        for (const id in gameState.players) {
            const player = gameState.players[id];
            
            if (player.number === 1) {
                // Player 1 (defender) positioned near their new wall
                player.position = {
                    x: 0,
                    y: PLAYER_SIZE * 2,
                    z: newCourtZOffset - COURT_LENGTH * 0.4 // Near negative wall
                };
            } else { // Player 2
                // Player 2 (attacker) positioned on the opposite side
                player.position = {
                    x: 0,
                    y: PLAYER_SIZE * 2,
                    z: newCourtZOffset + COURT_LENGTH * 0.4 // Near positive wall
                };
            }
            
            player.velocity = { x: 0, y: 0, z: 0 };
            player.isCharging = false;
            player.chargePower = MIN_CHARGE_POWER;
        }
    } else if (positiveWallBroken) {
        // Positive Z wall was broken (Player 2's wall)
        for (const id in gameState.players) {
            const player = gameState.players[id];
            
            if (player.number === 2) {
                // Player 2 (defender) positioned near their new wall
                player.position = {
                    x: 0,
                    y: PLAYER_SIZE * 2,
                    z: newCourtZOffset + COURT_LENGTH * 0.4 // Near positive wall
                };
            } else { // Player 1
                // Player 1 (attacker) positioned on the opposite side
                player.position = {
                    x: 0,
                    y: PLAYER_SIZE * 2,
                    z: newCourtZOffset - COURT_LENGTH * 0.4 // Near negative wall
                };
            }
            
            player.velocity = { x: 0, y: 0, z: 0 };
            player.isCharging = false;
            player.chargePower = MIN_CHARGE_POWER;
        }
    }
    // --- End Modified Player Positioning ---

    // --- START DEBUG LOGGING ---
    console.log("\n==== TRANSITION DEBUG - AFTER ====");
    console.log(`New court: ${gameState.currentCourtIndex}, New court Z offset: ${newCourtZOffset}`);
    console.log(`Ball position after: x=${ball.position.x.toFixed(2)}, y=${ball.position.y.toFixed(2)}, z=${ball.position.z.toFixed(2)}`);
 
    // Log each player's position
    for (const id in gameState.players) {
        const player = gameState.players[id];
        console.log(`Player ${player.number} after: x=${player.position.x.toFixed(2)}, y=${player.position.y.toFixed(2)}, z=${player.position.z.toFixed(2)}`);
    }
    console.log("============================\n");
    // --- END DEBUG LOGGING ---

    console.log(`Transition complete. New state courtIndex: ${gameState.currentCourtIndex}, Ball z: ${ball.position.z}`);

    // Broadcast the updated game state immediately after transition
    // The regular game loop broadcast might be slightly delayed
    io.emit('game_state_update', gameState);

    // Optionally, emit a specific transition event if clients need to do something special
    // io.emit('court_transition', { newCourtIndex: newCourtIndex, gameState: gameState });
}
// --- End NEW triggerCourtTransition ---

// --- NEW: Function to create a private game ---
function createPrivateGame(socket) {
    // Generate a unique game ID (simple implementation)
    const gameId = generateGameId();
    
    // Create game entry
    privateGames.set(gameId, {
        players: new Set([socket.id]),
        created: Date.now(),
        gameState: null // Will be initialized when game starts
    });
    
    // Send game ID to creator
    socket.emit('private_game_created', { 
        gameId: gameId,
        shareableLink: `${socket.handshake.headers.origin}?game=${gameId}`
    });
    
    console.log(`Private game created: ${gameId} by player ${socket.id}`);
    
    // Set expiry for unused games
    setTimeout(() => {
        const game = privateGames.get(gameId);
        if (game && game.players.size < 2) {
            privateGames.delete(gameId);
            console.log(`Private game expired: ${gameId}`);
            // Notify creator if they're still connected
            if (io.sockets.sockets.has(socket.id)) {
                socket.emit('private_game_expired', { gameId });
            }
        }
    }, PRIVATE_GAME_EXPIRY);
}

// --- Function to join a private game ---
function joinPrivateGame(socket, gameId) {
    // Check if game exists
    if (!privateGames.has(gameId)) {
        socket.emit('game_join_failed', { error: 'Game not found' });
        return;
    }
    
    const game = privateGames.get(gameId);
    
    // Check if game is full
    if (game.players.size >= 2) {
        socket.emit('game_join_failed', { error: 'Game is full' });
        return;
    }
    
    // Add player to game
    game.players.add(socket.id);
    
    // If game now has 2 players, start it
    if (game.players.size === 2) {
        const players = Array.from(game.players);
        
        // Assign player numbers
        initializePrivateGamePlayers(players[0], 1); // Creator is player 1
        initializePrivateGamePlayers(players[1], 2); // Joiner is player 2
        
        // Start the game
        console.log(`Starting private game ${gameId} with players ${players[0]} and ${players[1]}`);
    } else {
        // Waiting for another player
        socket.emit('waiting_for_opponent', { gameId });
    }
}

// --- Function to join a random game ---
function joinRandomGame(socket) {
    // If someone is in queue, match them
    if (randomQueue.length > 0) {
        const opponentId = randomQueue.shift();
        
        // Make sure opponent is still connected
        if (!io.sockets.sockets.has(opponentId)) {
            // Opponent disconnected, put current player in queue
            randomQueue.push(socket.id);
            return;
        }
        
        // Assign player numbers (first in queue is player 1)
        initializePrivateGamePlayers(opponentId, 1);
        initializePrivateGamePlayers(socket.id, 2);
        
        console.log(`Matched random players ${opponentId} and ${socket.id}`);
    } else {
        // Add to queue
        randomQueue.push(socket.id);
        socket.emit('waiting_for_random_match');
    }
}

// --- Helper function to initialize players when a game starts ---
function initializePrivateGamePlayers(socketId, playerNumber) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) return;
    
    // Initialize player state
    gameState.players[socketId] = {
        id: socketId,
        number: playerNumber,
        // Position relative to the STARTING (middle) court's center
        position: { x: 0, y: PLAYER_SIZE * 2, z: calculatePlayerStartZ(playerNumber, MIDDLE_COURT_INDEX) },
        velocity: { x: 0, y: 0, z: 0 },
        // Add other relevant player states from game.js (like charge, punch state etc.)
        isCharging: false,
        chargePower: 1.0
    };

    console.log(`Player ${playerNumber} assigned to ${socketId}`);
    socket.emit('player_assignment', { playerId: socketId, playerNumber: playerNumber });

    // Send initial game state to the player
    socket.emit('initial_state', {
        playerId: socketId,
        playerNumber: playerNumber,
        gameState: gameState // Send current players, ball, walls
    });

    // Notify other players about the new player
    socket.broadcast.emit('new_player', gameState.players[socketId]);
}

// --- Generate a random game ID ---
function generateGameId() {
    // Simple implementation - 6 character alphanumeric code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omitting easily confused characters
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Ensure uniqueness
    if (privateGames.has(result)) {
        return generateGameId(); // Regenerate if collision
    }
    
    return result;
}

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
}); 