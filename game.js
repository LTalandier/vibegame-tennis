// Game constants
const ARENA_SIZE = 300; 
const GAME_COURTS = 3; // Number of courts - can be changed to make longer or shorter games

// Player and ball size constants - defined early to be used by other constants
const PLAYER_SIZE = 5;
const BALL_SIZE = 5; // Ball size

// Rocket League tennis stadium constants
const STADIUM_WIDTH = ARENA_SIZE; // This will now be 300 instead of 150
const COURT_LENGTH = 500; // Base court length
const ARENA_LENGTH = COURT_LENGTH * GAME_COURTS; // Total arena length scales with number of courts
const STADIUM_HEIGHT = ARENA_SIZE * 1.2; // Increased height for more vertical play
const WALL_THICKNESS = 5;
const WALL_HEIGHT = STADIUM_HEIGHT * 0.8; // Increased wall height to 80% of stadium height
const COURT_COLOR = 0x44aa44; // Green tennis court
const LINE_COLOR = 0xffffff;  // White lines
const WALL_COLOR = 0x1a75ff;  // Blue walls like Rocket League
const GLASS_COLOR = 0xadd8e6; // Light blue transparent glass
const STANDS_COLOR = 0x333333; // Dark gray stands
const SEATS_COLORS = [0xff3333, 0x3366ff, 0xffcc00, 0x33cc33]; // Various colored seats

// Replace with punch constants
const PUNCH_POWER = 12; // Power multiplier for punch shots (reduced from 20)
const PUNCH_SPEED = 2; // Speed of punch animation
const ARM_LENGTH = PLAYER_SIZE * 2;
const FIST_SIZE = PLAYER_SIZE * 0.8;
const HAND_SIZE = PLAYER_SIZE * 0.5; // Size for Rayman-style gloves
const CRITICAL_HIT_BONUS = 2.0; // Bonus multiplier for hitting with the perfect timing (increased from 1.8)
const MIN_CHARGE_POWER = 1.0; // Minimum power multiplier when not charged
const MAX_CHARGE_POWER = 20.0; // Maximum power multiplier when fully charged (increased from 10.0)
const CHARGE_RATE = 1.0; // How fast the charge builds up per second (increased from 0.8)
const MAX_PUNCH_REACH = BALL_SIZE + PLAYER_SIZE * 6; // Max distance to hit the ball

// Wall breaking game constants
const WALL_MAX_HP = 100;    // Wall health points
const WALL_DAMAGE_FACTOR = 5; // Multiplier for damage calculation based on ball speed
const WALL_MIN_BOUNCE = 0.1; // Minimum bounce factor for heavily damaged walls
const WALL_MAX_BOUNCE = 0.1; // Maximum bounce factor for healthy walls

// PLAYER CONFIGURATION
const BALL_SPEED = 1; // Reduced from 0.4 to make the ball slower
const PLAYER_SPEED = 3; // Increased from 2
const PLAYER_BOOST_SPEED = 6.0; // Increased from 4.0
const KEYBOARD_SENSITIVITY = 0.5; // New constant to control keyboard input sensitivity
const ENEMY_SPEED = 2.0;
const GRAVITY = 0.04; // Increased from 0.015 for more realistic physics
const PLAYER_GRAVITY = 0.015; // Reduced gravity to make flying easier (was 0.03)
const CAMERA_FOLLOW_SPEED = 0.05; // New constant for camera following smoothness
const POINTS_PER_GOAL = 10; // Points for scoring a goal
const POINTS_PER_HIT = 1;   // Points for hitting the ball
const GOAL_LIMIT = 10; // New constant for max goals
const PLAYER_FLIGHT_SPEED = 1; // Speed for flying upward (new constant)

// GAMEPLAY CONFIGURATION
const MAX_SHOT_SPEED = 4.0; // Maximum ball speed after a racket hit (reduced from 6.0)

// NEW: Multiplayer Variables
let socket;
let myPlayerId = null;
let myPlayerNumber = null;
let opponents = {}; // Store opponent objects, keyed by their socket ID

// Game variables
let scene, camera, renderer;
// Player will now refer to the client's own character
// Enemy will refer to the opponent character, created when they connect
let player, enemy, ball;
let playerVelocity = new THREE.Vector3();
let ballVelocity = new THREE.Vector3();
let score = 0;
let goalsScored = 0; // Track number of goals scored
let enemyGoals = 0; // Track enemy goals
let playerWallHealth = WALL_MAX_HP; // Player wall health
let enemyWallHealth = WALL_MAX_HP;  // Enemy wall health
let joystick;
let isMobile = false;
let gameRunning = true;
let gamePaused = false; // New variable for pause state
let processKeyboardInput; // Store the keyboard input function
let cameraOffset = new THREE.Vector3(0, 40, 80); // Increased height and distance for better view of human characters
let consecutiveHits = 0; // Track consecutive hits for combo bonus
let lastHitter = null; // Track who hit the ball last
let boostActive = false; // Track if boost is active
let chargePower = MIN_CHARGE_POWER; // Current charge power for punch
let isCharging = false; // Whether the punch is being charged
let chargeStartTime = 0; // When the charge started
let shotDirectionArrow; // New variable for the direction arrow

// Multi-court game variables (will likely need server-side management later)
let totalCourts = GAME_COURTS;
let currentCourtIndex = Math.floor(totalCourts / 2);// Start at court 1 (middle court)
let playerWins = 0; // Number of walls player has broken
let enemyWins = 0; // Number of walls enemy has broken
let courtWallsHealth = []; // Array to store wall health for each court [0, 1, 2, ...]
let courts = {}; // Will store references to court objects
let isTransitioning = false; // Flag to track if players are transitioning between courts
let wallBreakParticles = []; // Array to store wall break particle effects

// Add global variables for UI elements
let playerHealthEl;
let enemyHealthEl;

// Animation loop - MODIFIED
function animate() {
    requestAnimationFrame(animate);

    if (!gameRunning || !player) return; // Wait for player object

    if (!gamePaused) {
        // --- Local Player Updates & Input ---
        // Process keyboard/touch input (which includes local prediction and emitting to server)
        if (!isMobile && processKeyboardInput) {
            processKeyboardInput();
        }
        // Note: Mobile input processing is handled within its event listeners in setupControls

        // Update LOCAL player running animation based on predicted velocity
        const playerMovementSpeed = Math.sqrt(
            playerVelocity.x * playerVelocity.x +
            playerVelocity.z * playerVelocity.z
        );
        // Make sure player object exists before trying to update animation
        if (player) {
           updateRunningAnimation(player, playerMovementSpeed);
        }


        // --- Opponent Updates (Based on Server Data) ---
        // Update opponent running animations based on velocity received from server
        for (const id in opponents) {
            const opponent = opponents[id];
            if (opponent && opponent.userData && opponent.userData.velocity) {
                 // Calculate speed from server velocity
                 const opponentSpeed = Math.sqrt(
                     opponent.userData.velocity.x * opponent.userData.velocity.x +
                     opponent.userData.velocity.z * opponent.userData.velocity.z
                 );
                 updateRunningAnimation(opponent, opponentSpeed);

                 // Store last position for interpolation (optional, can add later)
                 // opponent.userData.lastPosition = opponent.position.clone();
            }
         }


        // --- Ball Updates (Visuals based on Server Data) ---
        // Ball position/velocity is set directly by 'game_state_update' listener
        // Update ball trail based on server velocity
         if (ball && ballVelocity) { // Ensure ball and server velocity exist
             updateBallTrail(); // Keep visual effect, uses ballVelocity from server
         }


        // --- UI & Camera Updates ---
        // Update camera position to follow LOCAL player
        updateCamera();

        // Update wall appearance based on damage (Needs server data for health)
        // TODO: Get wall health updates from server
        // updateWallAppearance();

        // Update charge indicator (local)
        if (isCharging) {
            const chargeTime = (Date.now() - chargeStartTime) / 1000;
            chargePower = Math.min(MIN_CHARGE_POWER + (chargeTime * CHARGE_RATE), MAX_CHARGE_POWER);

            const chargeIndicator = document.getElementById('charge-indicator');
            const chargeFill = document.getElementById('charge-fill');
            if (chargeIndicator && chargeFill) {
                chargeIndicator.style.display = 'block';
                const chargePercent = ((chargePower - MIN_CHARGE_POWER) / (MAX_CHARGE_POWER - MIN_CHARGE_POWER)) * 100;
                chargeFill.style.width = chargePercent + '%';

                // Emit charge update periodically (optional, maybe only on punch?)
                // Consider throttling this if implemented:
                // if (socket && Date.now() % 100 < 20) { // Example: ~5 times/sec
                //     socket.emit('charge_update', { chargePower: chargePower });
                // }
            }

            // Update Shot Direction Arrow (local visual aid)
             if (shotDirectionArrow && player && ball) {
                 // Calculate direction based on current local player and server ball position
                 const predictedDirection = new THREE.Vector3();
                 // Check if ball exists before using its position
                 if(ball){
                    predictedDirection.subVectors(ball.position, player.position).normalize();
                 } else {
                     // Default direction if ball doesn't exist yet
                     predictedDirection.set(0, 0, (myPlayerNumber === 1 ? 1 : -1)); // Point towards opponent side
                 }


                 const arrowLength = MAX_PUNCH_REACH;
                 const arrowOrigin = player.position.clone();
                 arrowOrigin.addScaledVector(predictedDirection, PLAYER_SIZE);

                 shotDirectionArrow.position.copy(arrowOrigin);
                 shotDirectionArrow.setDirection(predictedDirection);
                 const headLength = PLAYER_SIZE * 0.8;
                 const headWidth = PLAYER_SIZE * 0.6;
                 shotDirectionArrow.setLength(arrowLength - PLAYER_SIZE, headLength, headWidth);
                 shotDirectionArrow.visible = true;
             }

        } else {
            // Hide charge indicator when not charging
            const chargeIndicator = document.getElementById('charge-indicator');
            if (chargeIndicator) {
                chargeIndicator.style.display = 'none';
            }
             // Hide Shot Direction Arrow when not charging
             if (shotDirectionArrow) {
                 shotDirectionArrow.visible = false;
             }
        }

        // Update player position display (local player + opponent from opponents map)
        updatePositionDisplay(); // Modify this function if needed
    } // End of if(!gamePaused) block

    // Render scene with camera
    if (renderer && scene && camera) { // Ensure they exist
       renderer.render(scene, camera);
    }
} // End of animate function

// Initialize the game
function init() {
    // Check if device is mobile
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // NEW: Setup Socket Connection FIRST
    setupSocketConnection();
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Bright blue sky
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 40, 80); // Start camera behind and above player
    camera.up.set(0, 1, 0); // Ensure the camera's up vector is correct
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; // Enable shadow mapping
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    document.getElementById('game-container').appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Increased ambient light slightly
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Slightly reduced intensity
    directionalLight.position.set(15, 30, 20); // Adjusted position for better shadow angles
    directionalLight.castShadow = true; // Enable shadow casting
    // Configure shadow properties for directional light (optional, adjust as needed)
    directionalLight.shadow.mapSize.width = 1024; 
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -STADIUM_WIDTH;
    directionalLight.shadow.camera.right = STADIUM_WIDTH;
    directionalLight.shadow.camera.top = COURT_LENGTH;
    directionalLight.shadow.camera.bottom = -COURT_LENGTH;
    scene.add(directionalLight);
    
    // Create arena
    createArena();
    
    // Create LOCAL player (color/position might be adjusted by server later)
    player = createCharacter(0x3498db); // Default blue
    player.castShadow = true;
    player.receiveShadow = true;
    player.userData.skipCourtConstraints = false;
    player.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    // Don't set initial position here yet, wait for server assignment
    scene.add(player);
    
    // Create ball (its state will be synced from server)
    ball = createBall();
    ball.castShadow = true; // Ball casts shadow
    scene.add(ball);

    // Create Shot Direction Arrow
    const arrowDir = new THREE.Vector3(0, 0, -1); // Initial direction
    const arrowOrigin = new THREE.Vector3(0, 0, 0); // Initial position
    // Use MAX_PUNCH_REACH for initial length for consistency
    const arrowLength = MAX_PUNCH_REACH; 
    const arrowColor = 0xffffff; // White arrow
    // Increase headLength and headWidth for a thicker appearance
    const headLength = PLAYER_SIZE * 0.8; // Increased from 0.5
    const headWidth = PLAYER_SIZE * 0.6;  // Increased from 0.3
    shotDirectionArrow = new THREE.ArrowHelper(arrowDir, arrowOrigin, arrowLength, arrowColor, headLength, headWidth);
    shotDirectionArrow.visible = false; // Start hidden
    scene.add(shotDirectionArrow);
    
    // Initialize ball velocity
    resetBall();
    
    // Debug ball position after reset
    console.log("Ball position after reset:", ball.position.x, ball.position.y, ball.position.z);
    
    // Set up controls
    processKeyboardInput = setupControls();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
    
    // Create UI
    createUI();
    
    // Update court display (might need server data later)
    updateCurrentCourtDisplay();
    
    // Start game loop
    animate();
}

// NEW: Function to set up Socket.IO connection and listeners
function setupSocketConnection() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        myPlayerId = socket.id;
    });

    socket.on('player_assignment', (data) => {
        if (data.playerId === myPlayerId) {
            myPlayerNumber = data.playerNumber;
            console.log(`Assigned as Player ${myPlayerNumber}`);

            // Now set initial position based on player number
            // Simplified: Assuming single court for now (like server.js)
            const initialZ = (myPlayerNumber === 1) ? -COURT_LENGTH / 2 + PLAYER_SIZE * 3 : COURT_LENGTH / 2 - PLAYER_SIZE * 3;
            player.position.set(0, PLAYER_SIZE * 2, initialZ);
            console.log("Set initial player position:", player.position);

            // Rotate Player 2's character model to face their goal
            if (myPlayerNumber === 2) {
                player.rotation.y = Math.PI; // Rotate 180 degrees
            }

            // Adjust player color based on number (optional)
            if (player.userData.head) {
                 const playerColor = (myPlayerNumber === 1) ? 0x3498db : 0xe74c3c;
                 player.traverse((child) => {
                    if(child.isMesh && child.material) {
                        // Check if material has color property before setting
                        if (child.material.color) {
                           child.material.color.setHex(playerColor);
                        }
                    }
                 });
            }
        }
    });

    // Handle initial state from server
    socket.on('initial_state', (data) => {
        console.log('Received initial state:', data);
        myPlayerId = data.playerId;
        myPlayerNumber = data.playerNumber;
        console.log(`Assigned as Player ${myPlayerNumber} (${myPlayerId})`);

        // Set local player properties based on assignment
        const initialZ = (myPlayerNumber === 1) ? -COURT_LENGTH / 2 + PLAYER_SIZE * 3 : COURT_LENGTH / 2 - PLAYER_SIZE * 3;
        player.position.set(0, PLAYER_SIZE * 2, initialZ);
        const playerColor = (myPlayerNumber === 1) ? 0x3498db : 0xe74c3c;
        
        // Rotate Player 2's character model to face their goal
        if (myPlayerNumber === 2) {
            player.rotation.y = Math.PI; // Rotate 180 degrees
        }
        
        player.traverse((child) => {
            if(child.isMesh && child.material && child.material.color) {
               child.material.color.setHex(playerColor);
            }
        });

        // Process initial game state
        processGameStateUpdate(data.gameState);

        // Add existing opponents
        for (const id in data.gameState.players) {
            if (id !== myPlayerId) {
                addOpponent(data.gameState.players[id]);
            }
        }
    });

    socket.on('new_player', (opponentData) => {
        console.log('New opponent connected:', opponentData);
        if (opponentData.id !== myPlayerId) {
            addOpponent(opponentData);
        }
    });

    socket.on('player_disconnected', (opponentId) => {
        console.log('Opponent disconnected:', opponentId);
        removeOpponent(opponentId);
    });

    socket.on('game_full', () => {
        alert('Game is full. Please try again later.');
        // Disable game or redirect
        document.getElementById('game-container').innerHTML = '<h1>Game Full</h1>';
    });

    // Listener for receiving game state updates from server
    socket.on('game_state_update', (gameState) => {
        // Update ball position and velocity (AUTHORITATIVE from server)
        if (ball && gameState.ball) {
            ball.position.set(gameState.ball.position.x, gameState.ball.position.y, gameState.ball.position.z);
            ballVelocity.set(gameState.ball.velocity.x, gameState.ball.velocity.y, gameState.ball.velocity.z);
            // We might want interpolation later for smoothness
        }

        // Update local player position if available (IMPORTANT for court transitions)
        if (player && myPlayerId && gameState.players[myPlayerId]) {
            const myServerState = gameState.players[myPlayerId];
            // During transitions, snap to server position immediately
            if (isTransitioning) {
                player.position.set(myServerState.position.x, myServerState.position.y, myServerState.position.z);
                playerVelocity.set(myServerState.velocity.x, myServerState.velocity.y, myServerState.velocity.z);
            } else {
                // Optional: Apply some smoothing during normal gameplay
                // This is for visual quality only - server position remains authoritative
                player.position.x = player.position.x * 0.8 + myServerState.position.x * 0.2;
                player.position.y = player.position.y * 0.8 + myServerState.position.y * 0.2;
                player.position.z = player.position.z * 0.8 + myServerState.position.z * 0.2;
            }
        }

        // Update opponent positions (AUTHORITATIVE from server)
        for (const id in gameState.players) {
            if (id !== myPlayerId && opponents[id]) {
                const opponentState = gameState.players[id];
                opponents[id].position.set(opponentState.position.x, opponentState.position.y, opponentState.position.z);
                // Update opponent velocity if needed for animations
                if (opponents[id].userData) {
                     opponents[id].userData.velocity.set(opponentState.velocity.x, opponentState.velocity.y, opponentState.velocity.z);
                }
                // We might want interpolation later for smoothness
            }
        }
        
        // Update Wall Health (for UI)
        if (gameState.walls) {
            // Determine which wall is player's and which is enemy's
            const myWallKey = `player${myPlayerNumber}`;
            const enemyWallKey = `player${myPlayerNumber === 1 ? 2 : 1}`;

            const oldPlayerHealth = playerWallHealth; // Store old value to detect changes
            const oldEnemyHealth = enemyWallHealth; // Store old value to detect changes

            playerWallHealth = gameState.walls[myWallKey] !== undefined ? gameState.walls[myWallKey] : WALL_MAX_HP;
            enemyWallHealth = gameState.walls[enemyWallKey] !== undefined ? gameState.walls[enemyWallKey] : WALL_MAX_HP;

            // Update UI elements
            if(playerHealthEl) {
                playerHealthEl.textContent = playerWallHealth;
                
                // Highlight if health changed (decreased)
                if (oldPlayerHealth > playerWallHealth) {
                    flashElement(playerHealthEl.parentElement, 'rgba(231, 76, 60, 0.5)');
                }
            }
            if(enemyHealthEl) {
                enemyHealthEl.textContent = enemyWallHealth;
                
                // Highlight if health changed (decreased)
                if (oldEnemyHealth > enemyWallHealth) {
                    flashElement(enemyHealthEl.parentElement, 'rgba(46, 204, 113, 0.5)');
                }
            }

            // Update visual appearance of walls
            updateWallAppearance();
        }
        
        // Update player win counts
        if (gameState.player1Wins !== undefined && gameState.player2Wins !== undefined) {
            const playerWinsEl = document.getElementById('player-wins');
            const enemyWinsEl = document.getElementById('enemy-wins');
            
            // Update based on player number
            if (playerWinsEl && enemyWinsEl) {
                if (myPlayerNumber === 1) {
                    playerWinsEl.textContent = gameState.player1Wins;
                    enemyWinsEl.textContent = gameState.player2Wins;
                } else {
                    playerWinsEl.textContent = gameState.player2Wins;
                    enemyWinsEl.textContent = gameState.player1Wins;
                }
            }
        }
        
        // If currentCourtIndex is in the state, update the local value
        if (gameState.currentCourtIndex !== undefined) {
            currentCourtIndex = gameState.currentCourtIndex;
            updateCurrentCourtDisplay(); // Update the UI to show current court
        }
    });

    // Listener for specific player punched events
    socket.on('player_punched', (data) => {
        if (data.id === myPlayerId) {
            // Local player punch animation already triggered by input
        } else if (opponents[data.id]) {
            // Trigger punch animation for the opponent
            punchBall(opponents[data.id]); // Use the existing punch animation
        }
    });

    // NEW: Listen for wall hit events
    socket.on('wall_hit', (data) => {
        console.log('Wall hit event:', data);
        // Find the wall mesh corresponding to data.wallOwner
        // Note: Wall identification might need improvement if using multi-court
        const wallIsPlayerSide = (myPlayerNumber === 1 && data.wallOwner === 'player1') || (myPlayerNumber === 2 && data.wallOwner === 'player2');
        let targetWallMesh = null;
        scene.traverse(child => {
             // Simplified: Assuming single court, find player or enemy side wall
            if (child.userData && child.userData.isBackWall) {
                if (wallIsPlayerSide && child.userData.isPlayerSide) {
                    targetWallMesh = child;
                } else if (!wallIsPlayerSide && child.userData.isEnemySide) {
                    targetWallMesh = child;
                }
            }
        });

        // Create hit effect at the ball's position from the event data
        if (data.position) {
           const effectPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
           createWallHitEffect(effectPos, data.damage);
        }
        
        // Immediately update wall health in UI
        if (wallIsPlayerSide) {
            // Our wall was hit - update player wall health
            playerWallHealth = data.damage > playerWallHealth ? 0 : playerWallHealth - data.damage;
            if (playerHealthEl) playerHealthEl.textContent = playerWallHealth;
        } else {
            // Enemy wall was hit - update enemy wall health
            enemyWallHealth = data.damage > enemyWallHealth ? 0 : enemyWallHealth - data.damage;
            if (enemyHealthEl) enemyHealthEl.textContent = enemyWallHealth;
        }
        
        // Update visual appearance of walls
        updateWallAppearance();
    });

    // NEW: Listen for wall broken events
    socket.on('wall_broken', (data) => {
        console.log('Wall broken event:', data);
        // Find the wall mesh corresponding to data.wallOwner
         const wallIsPlayerSide = (myPlayerNumber === 1 && data.wallOwner === 'player1') || (myPlayerNumber === 2 && data.wallOwner === 'player2');
        let targetWallMesh = null;
        scene.traverse(child => {
            if (child.userData && child.userData.isBackWall) {
                 if (wallIsPlayerSide && child.userData.isPlayerSide) {
                     targetWallMesh = child;
                 } else if (!wallIsPlayerSide && child.userData.isEnemySide) {
                     targetWallMesh = child;
                 }
             }
         });

        if (targetWallMesh) {
            createWallBreakAnimation(targetWallMesh);
        }
        
        // Set transitioning flag to allow camera to snap immediately to new position
        isTransitioning = true;
        setTimeout(() => {
            isTransitioning = false;
        }, 1000); // Reset after 1 second
        
        // Note: actual player repositioning will be handled by game_state_update event
    });

    // NEW: Listen for score updates
    socket.on('score_update', (data) => {
        console.log('Score update:', data);
        
        // Update local score variables
        if (data.scores) {
            const myPlayer = `player${myPlayerNumber}`;
            const opponentPlayer = `player${myPlayerNumber === 1 ? 2 : 1}`;
            
            // Update score display
            const scoreValueEl = document.getElementById('score-value');
            if (scoreValueEl) {
                scoreValueEl.textContent = data.scores[myPlayer];
            }
            
            // Update opponent score display (if it exists)
            const opponentScoreEl = document.getElementById('opponent-score-value');
            if (opponentScoreEl) {
                opponentScoreEl.textContent = data.scores[opponentPlayer];
            } else {
                // If opponent score element doesn't exist, create it
                createOpponentScoreDisplay(data.scores[opponentPlayer]);
            }
        }
        
        // Play celebration effect if I scored
        if (data.scoringPlayer === `player${myPlayerNumber}`) {
            // Flash screen green for success
            flashScreen('rgba(46, 204, 113, 0.3)');
            // Play celebration sound or animation if available
        } else {
            // Flash screen red if opponent scored
            flashScreen('rgba(231, 76, 60, 0.3)');
        }
    });

    // NEW: Listen for round reset (when a wall breaks but game continues)
    socket.on('round_reset', (newState) => {
        console.log("Round reset received");
        resetRound(newState);
    });

    // NEW: Listen for game over event
    socket.on('game_over', (data) => {
        console.log("Game over event:", data);
        
        // Determine if local player won
        const iWon = data.winner === `player${myPlayerNumber}`;
        
        // Get final scores
        const myScore = data.scores[`player${myPlayerNumber}`];
        const opponentScore = data.scores[`player${myPlayerNumber === 1 ? 2 : 1}`];

        // Update UI elements for final score
        const playerWinsEl = document.getElementById('player-wins');
        const enemyWinsEl = document.getElementById('enemy-wins');
        if(playerWinsEl) playerWinsEl.textContent = myScore;
        if(enemyWinsEl) enemyWinsEl.textContent = opponentScore;
        
        // Show appropriate game over message
        showGameOver(iWon, data.scores);
        
        // Game will stay in game over state until player clicks "Play Again" button
    });

    // NEW: Listen for game reset event
    socket.on('game_reset', (newState) => {
        console.log("Received game reset");
        resetLocalGame(newState);
    });

    // Add more listeners for wall hits, score updates, etc.
}

// NEW: Function to add opponent character
function addOpponent(opponentData) {
    if (opponents[opponentData.id]) return; // Already exists

    console.log("Adding opponent:", opponentData);
    const opponentColor = (opponentData.number === 1) ? 0x3498db : 0xe74c3c;
    const newOpponent = createCharacter(opponentColor);
    newOpponent.position.set(opponentData.position.x, opponentData.position.y, opponentData.position.z);
    newOpponent.castShadow = true;
    newOpponent.receiveShadow = true;
    newOpponent.userData.id = opponentData.id; // Store socket ID
    newOpponent.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    opponents[opponentData.id] = newOpponent;
    enemy = newOpponent; // Assign to global 'enemy' for now (assuming 1v1)
    scene.add(enemy);
    console.log("Opponent added to scene");
}

// NEW: Function to remove opponent character
function removeOpponent(opponentId) {
    if (opponents[opponentId]) {
        console.log("Removing opponent:", opponentId);
        scene.remove(opponents[opponentId]);
        delete opponents[opponentId];
        if (enemy && enemy.userData.id === opponentId) {
            enemy = null; // Clear global enemy reference if it was this one
        }
    }
}

// Create arena boundaries
function createArena() {
    // Initialize court walls health array for all courts
    for (let i = 0; i < totalCourts; i++) {
        courtWallsHealth[i] = { player: WALL_MAX_HP, enemy: WALL_MAX_HP };
    }
    
    // Calculate the middle court index for reference (for an even number of courts, this will be the higher middle)
    const middleCourtIndex = Math.floor(totalCourts / 2);
    console.log("Middle court index:", middleCourtIndex);
    // Create the specified number of courts along the Z-axis
    for (let i = 0; i < totalCourts; i++) {
        // Position courts with middle court at z=0, increasing positive Z for higher indices
        const zOffset = (i - middleCourtIndex) * COURT_LENGTH;
        console.log("Z offset:", zOffset);
        createCourt(i, zOffset);
    }
    
    
    
    // Add stands and audience
    createStands();
    
    // Add stadium lighting
    addStadiumLighting();
}

// Create a single court at specified Z position
function createCourt(courtIndex, zOffset) {
    // Create a group to hold all court elements
    const courtGroup = new THREE.Group();
    courtGroup.position.z = zOffset; // REVERSED Z position
    scene.add(courtGroup);
    
    // Store reference to court
    courts[courtIndex] = courtGroup;
    
    // Create stadium floor (tennis court)
    const floorGeometry = new THREE.PlaneGeometry(STADIUM_WIDTH, COURT_LENGTH);
    const floorMaterial = new THREE.MeshPhongMaterial({ 
        color: COURT_COLOR,
        side: THREE.DoubleSide,
        shininess: 5, 
        flatShading: true 
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = -PLAYER_SIZE;
    floor.receiveShadow = true; // Floor receives shadows
    courtGroup.add(floor);
    
    // Add court markings (tennis court lines)
    addCourtLines(courtGroup);
    
    // Add curved walls like in Rocket League
    createRocketLeagueWalls(courtGroup, courtIndex);
    
    // Add a tennis net
    createTennisNet(courtGroup);
}



// Add court markings (tennis court lines) to a court group
function addCourtLines(courtGroup) {
    const lineMaterial = new THREE.MeshBasicMaterial({ color: LINE_COLOR });
    
    // Center line
    const centerLine = new THREE.Mesh(
        new THREE.PlaneGeometry(STADIUM_WIDTH, 2),
        lineMaterial
    );
    centerLine.rotation.x = Math.PI / 2;
    centerLine.position.y = -PLAYER_SIZE + 0.1;
    courtGroup.add(centerLine);
    
    // Baseline (back line) - player side
    const playerBaseline = new THREE.Mesh(
        new THREE.PlaneGeometry(STADIUM_WIDTH, 2),
        lineMaterial
    );
    playerBaseline.rotation.x = Math.PI / 2;
    playerBaseline.position.z = COURT_LENGTH / 4;
    playerBaseline.position.y = -PLAYER_SIZE + 0.1;
    courtGroup.add(playerBaseline);
    
    // Baseline (back line) - enemy side
    const enemyBaseline = new THREE.Mesh(
        new THREE.PlaneGeometry(STADIUM_WIDTH, 2),
        lineMaterial
    );
    enemyBaseline.rotation.x = Math.PI / 2;
    enemyBaseline.position.z = -COURT_LENGTH / 4;
    enemyBaseline.position.y = -PLAYER_SIZE + 0.1;
    courtGroup.add(enemyBaseline);
    
    // Sidelines
    const leftSideline = new THREE.Mesh(
        new THREE.PlaneGeometry(2, COURT_LENGTH / 2),
        lineMaterial
    );
    leftSideline.rotation.x = Math.PI / 2;
    leftSideline.position.x = -STADIUM_WIDTH / 3;
    leftSideline.position.y = -PLAYER_SIZE + 0.1;
    courtGroup.add(leftSideline);
    
    const rightSideline = new THREE.Mesh(
        new THREE.PlaneGeometry(2, COURT_LENGTH / 2),
        lineMaterial
    );
    rightSideline.rotation.x = Math.PI / 2;
    rightSideline.position.x = STADIUM_WIDTH / 3;
    rightSideline.position.y = -PLAYER_SIZE + 0.1;
    courtGroup.add(rightSideline);
}

// Create a tennis net for a court group
function createTennisNet(courtGroup) {
    const netWidth = STADIUM_WIDTH * 0.8;
    const netHeight = 15;
    
    // Net posts
    const postGeometry = new THREE.CylinderGeometry(2, 2, 20, 16);
    const postMaterial = new THREE.MeshPhongMaterial({ color: 0xdddddd });
    
    const leftPost = new THREE.Mesh(postGeometry, postMaterial);
    leftPost.position.set(-netWidth/2, 10 - PLAYER_SIZE, 0);
    leftPost.castShadow = true; // Post casts shadow
    courtGroup.add(leftPost);
    
    const rightPost = new THREE.Mesh(postGeometry, postMaterial);
    rightPost.position.set(netWidth/2, 10 - PLAYER_SIZE, 0);
    rightPost.castShadow = true; // Post casts shadow
    courtGroup.add(rightPost);
    
    // Net top band
    const topBandGeometry = new THREE.BoxGeometry(netWidth, 1, 1);
    const topBandMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const topBand = new THREE.Mesh(topBandGeometry, topBandMaterial);
    topBand.position.set(0, netHeight - PLAYER_SIZE, 0);
    topBand.castShadow = true; // Top band casts shadow
    courtGroup.add(topBand);
    
    // Net mesh (using lines for a more realistic net effect)
    const netGroup = new THREE.Group();
    
    // Vertical lines
    const verticalCount = 40;
    const verticalSpacing = netWidth / verticalCount;
    
    for (let i = 0; i <= verticalCount; i++) {
        const x = -netWidth/2 + i * verticalSpacing;
        const lineGeometry = new THREE.BufferGeometry();
        const lineVertices = new Float32Array([
            x, 0 - PLAYER_SIZE, 0,
            x, netHeight - PLAYER_SIZE, 0
        ]);
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(lineVertices, 3));
        
        const line = new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8 })
        );
        netGroup.add(line);
    }
    
    // Horizontal lines
    const horizontalCount = 10;
    const horizontalSpacing = netHeight / horizontalCount;
    
    for (let i = 0; i <= horizontalCount; i++) {
        const y = i * horizontalSpacing - PLAYER_SIZE;
        const lineGeometry = new THREE.BufferGeometry();
        const lineVertices = new Float32Array([
            -netWidth/2, y, 0,
            netWidth/2, y, 0
        ]);
        lineGeometry.setAttribute('position', new THREE.BufferAttribute(lineVertices, 3));
        
        const line = new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8 })
        );
        netGroup.add(line);
    }
    
    courtGroup.add(netGroup);
}

// Create Rocket League style curved walls for a court
function createRocketLeagueWalls(courtGroup, courtIndex) {
    // Create transparent wall material for back walls
    const transparentWallMaterial = new THREE.MeshPhongMaterial({
        color: WALL_COLOR,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
    });
    
    // Side walls (along X axis)
    const sideWallGeometry = new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, COURT_LENGTH);
    
    // Left side wall
    const leftSideWall = new THREE.Mesh(sideWallGeometry, transparentWallMaterial.clone());
    leftSideWall.position.set(-STADIUM_WIDTH/2, WALL_HEIGHT/2 - PLAYER_SIZE, 0);
    leftSideWall.receiveShadow = true;
    courtGroup.add(leftSideWall);
    
    // Right side wall
    const rightSideWall = new THREE.Mesh(sideWallGeometry, transparentWallMaterial.clone());
    rightSideWall.position.set(STADIUM_WIDTH/2, WALL_HEIGHT/2 - PLAYER_SIZE, 0);
    rightSideWall.receiveShadow = true;
    courtGroup.add(rightSideWall);
    
    // End walls with goals (along Z axis - breakable)
    const endWallGeometry = new THREE.BoxGeometry(STADIUM_WIDTH, WALL_HEIGHT, WALL_THICKNESS);
    
    // Player side wall - now at negative Z
    const playerSideWall = new THREE.Mesh(endWallGeometry, transparentWallMaterial.clone());
    playerSideWall.position.set(0, WALL_HEIGHT/2 - PLAYER_SIZE, -COURT_LENGTH/2); // REVERSED
    playerSideWall.receiveShadow = true; // Wall receives shadow
    playerSideWall.userData = {
        isBackWall: true,
        isPlayerSide: true,
        courtIndex: courtIndex,
        health: WALL_MAX_HP
    };
    courtGroup.add(playerSideWall);
    
    // Enemy side wall - now at positive Z
    const enemySideWall = new THREE.Mesh(endWallGeometry, transparentWallMaterial.clone());
    enemySideWall.position.set(0, WALL_HEIGHT/2 - PLAYER_SIZE, COURT_LENGTH/2); // REVERSED
    enemySideWall.receiveShadow = true;
    enemySideWall.userData = {
        isBackWall: true,
        isEnemySide: true,
        courtIndex: courtIndex,
        health: WALL_MAX_HP
    };
    courtGroup.add(enemySideWall);
}

// Create stadium stands with audience
function createStands() {
    // Create stand sections around the arena
    const standSections = 8;
    const sectionAngle = Math.PI * 2 / standSections;
    const standRadius = Math.max(STADIUM_WIDTH, ARENA_LENGTH) * 0.9;
    const standHeight = STADIUM_HEIGHT * 0.8;
    const standDepth = STADIUM_HEIGHT * 0.5;
    
    // Create stands material
    const standsMaterial = new THREE.MeshPhongMaterial({
        color: STANDS_COLOR,
        shininess: 20
    });
    
    for (let i = 0; i < standSections; i++) {
        const angle = i * sectionAngle;
        const x = Math.sin(angle) * standRadius;
        const z = Math.cos(angle) * standRadius;
        
        // Create stand section
        const standGeometry = new THREE.BoxGeometry(standRadius / 2, standHeight, standDepth);
        const stand = new THREE.Mesh(standGeometry, standsMaterial);
        
        stand.position.set(x, standHeight/2 - PLAYER_SIZE, z);
        stand.lookAt(0, -PLAYER_SIZE, 0);
        scene.add(stand);
        
        // Add audience (rows of colored seats)
        createAudience(stand, standHeight, standRadius / 2, standDepth);
    }
}

// Create audience with colored seats
function createAudience(stand, standHeight, standWidth, standDepth) {
    const rows = 10;
    const seatsPerRow = 20;
    const seatSize = 3;
    
    for (let row = 0; row < rows; row++) {
        const rowY = (row / rows) * standHeight - PLAYER_SIZE + 5;
        
        for (let seat = 0; seat < seatsPerRow; seat++) {
            // Distribute seats horizontally along the stand width
            const seatX = (seat / seatsPerRow - 0.5) * standWidth * 0.8;
            
            // Create a set at each position
            const seatColor = SEATS_COLORS[Math.floor(Math.random() * SEATS_COLORS.length)];
            const seatMaterial = new THREE.MeshPhongMaterial({ color: seatColor });
            const seatGeometry = new THREE.BoxGeometry(seatSize, seatSize, seatSize);
            
            const seatObj = new THREE.Mesh(seatGeometry, seatMaterial);
            
            // Position relative to stand
            const seatPosition = new THREE.Vector3(seatX, rowY + standHeight / 2, -standDepth / 2 + 10 + row * 2);
            seatObj.position.copy(seatPosition);
            
            // Add seat to the stand
            stand.add(seatObj);
        }
    }
}

// Add stadium lighting
function addStadiumLighting() {
    // Clear existing lights (keep the main directional light added in init)
    scene.children.forEach(child => {
        if (child.isLight && child.type !== 'AmbientLight' && child.type !== 'DirectionalLight') {
            scene.remove(child);
        }
    });
    
    // Ambient light is already added in init()
    
    // Add spotlight from above - ADJUSTED
    const spotLightCount = 4; // Reduced count for less overlap
    
    for (let i = 0; i < spotLightCount; i++) {
        const angle = (i / spotLightCount) * Math.PI * 2 + Math.PI / 4; // Offset start angle
        const radius = STADIUM_WIDTH * 0.4; // Slightly wider spread
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        
        const spotLight = new THREE.SpotLight(
            0xffffff, 
            0.5, // Reduced intensity
            STADIUM_HEIGHT * 3, 
            Math.PI / 5, // Wider angle
            0.5, // Increased penumbra for softer edges
            1.5 // Adjusted decay
        );
        spotLight.position.set(x, STADIUM_HEIGHT * 1.2, z); // Positioned slightly higher
        spotLight.target.position.set(x * 0.3, -PLAYER_SIZE, z * 0.3); // Target slightly offset from center
        
        spotLight.castShadow = true; // Spotlights cast shadows
        spotLight.shadow.mapSize.width = 512; // Lower resolution for performance
        spotLight.shadow.mapSize.height = 512;
        spotLight.shadow.camera.near = 10;
        spotLight.shadow.camera.far = STADIUM_HEIGHT * 4;
        
        scene.add(spotLight);
        scene.add(spotLight.target);
        
        // Add visual representation of the light (optional)
        const spotLightHelper = new THREE.Mesh(
            new THREE.SphereGeometry(3, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffff99, transparent: true, opacity: 0.5 }) // Make helper less intrusive
        );
        spotLightHelper.position.copy(spotLight.position);
        scene.add(spotLightHelper);
    }
    
    // Add colored accent lights around the arena
    const accentLightColors = [0xff3333, 0x3366ff, 0xffcc00, 0x33cc33];
    const accentLightCount = 8;
    
    for (let i = 0; i < accentLightCount; i++) {
        const angle = (i / accentLightCount) * Math.PI * 2;
        const radius = Math.max(STADIUM_WIDTH, COURT_LENGTH) * 0.6;
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        
        const accentLight = new THREE.PointLight(
            accentLightColors[i % accentLightColors.length],
            0.5,
            STADIUM_HEIGHT * 2
        );
        accentLight.position.set(x, WALL_HEIGHT, z);
        scene.add(accentLight);
    }
}

// Create character (player/enemy) with Rayman-style floating limbs
function createCharacter(color) {
    const character = new THREE.Group();
    character.userData = {
        velocity: new THREE.Vector3(),
        onGround: false,
        canJump: true,
        isBoosting: false,
        boostFuel: 100,
        isPunching: false,
        punchCooldown: false,
        lastHitTime: 0,
        comboCount: 0,
        maxCombo: 0,
        score: 0,
        isFlying: false, // Added flag for flying state
        canFly: true, // Added flag to control flight ability
        isStunned: false, // Added flag for stun state
        stunDuration: 0, // Duration of the stun
        lastStunTime: 0, // Time when the last stun occurred
        powerShotCharge: 0, // Charge level for power shot
        isChargingPowerShot: false, // Flag for charging power shot
        lastWallHitTime: 0, // Track last wall hit time
        wallHitCooldown: 0.5, // Cooldown period for wall hits in seconds
        wallHp: WALL_MAX_HP, // Initialize wall HP for the character's goal wall
        wallDamageTaken: 0, // Track damage taken by the wall
        isCriticalHitAvailable: false, // Flag for critical hit availability
        lastCriticalHitTime: 0, // Time of the last critical hit
        criticalHitCooldown: 10, // Cooldown for critical hit in seconds
        isAnimatingPunch: false, // Flag to track if punch animation is active
        isAnimatingHead: false, // Flag to track if head animation is active
        isRunning: false, // Flag to track running state
        runSpeed: 0, // Current run speed for animation
        animationPhase: 0, // Phase for running animation
        lastPosition: new THREE.Vector3(), // Store last position for speed calculation
        currentSpeed: 0, // Store current speed
        isRaymanStyle: true // Flag to indicate Rayman-style character
    };

    // Head
    const headGeometry = new THREE.SphereGeometry(PLAYER_SIZE * 0.5, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({ color: color });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = PLAYER_SIZE * 1.2; // Position head slightly higher
    character.add(head);
    character.userData.head = head; // Store reference to head

    // Torso (Changed to Sphere for Rayman-like appearance)
    const torsoGeometry = new THREE.SphereGeometry(PLAYER_SIZE * 0.6, 32, 32); // Use SphereGeometry
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: color });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = PLAYER_SIZE * 0.5; // Position torso below the head
    character.add(torso);
    character.userData.torso = torso; // Store reference to torso

    // Eyes (Optional - Add simple eyes if desired)
    const eyeGeometry = new THREE.SphereGeometry(PLAYER_SIZE * 0.1, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-PLAYER_SIZE * 0.2, PLAYER_SIZE * 1.3, PLAYER_SIZE * 0.4);
    character.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(PLAYER_SIZE * 0.2, PLAYER_SIZE * 1.3, PLAYER_SIZE * 0.4);
    character.add(rightEye);

    // Pupil (Optional)
    const pupilGeometry = new THREE.SphereGeometry(PLAYER_SIZE * 0.05, 16, 16);
    const pupilMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const leftPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    leftPupil.position.set(-PLAYER_SIZE * 0.2, PLAYER_SIZE * 1.3, PLAYER_SIZE * 0.45); // Slightly forward
    character.add(leftPupil);
    const rightPupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    rightPupil.position.set(PLAYER_SIZE * 0.2, PLAYER_SIZE * 1.3, PLAYER_SIZE * 0.45); // Slightly forward
    character.add(rightPupil);



    // Hands (Repositioned to float)
    const handGeometry = new THREE.SphereGeometry(PLAYER_SIZE * 0.3, 16, 16); // Simple sphere for hands
    const handMaterial = new THREE.MeshStandardMaterial({ color: 0xffdbac }); // Skin color

    const leftHand = new THREE.Mesh(handGeometry, handMaterial);
    // Position floating near where shoulder would be
    leftHand.position.set(-PLAYER_SIZE * 1.2, PLAYER_SIZE * 0.7, 0);
    character.add(leftHand);
    character.userData.leftHand = leftHand; // Store reference

    const rightHand = new THREE.Mesh(handGeometry, handMaterial);
    // Position floating near where shoulder would be
    rightHand.position.set(PLAYER_SIZE * 1.2, PLAYER_SIZE * 0.7, 0);
    character.add(rightHand);
    character.userData.rightHand = rightHand; // Store reference


    // --- Removed Leg Creation ---


    // Feet (Repositioned to float) - Changed to Half-Ellipsoids
    const footRadius = PLAYER_SIZE * 0.2;
    const footSegments = 16;
    // Create geometry for the bottom half of a sphere
    const footGeometry = new THREE.SphereGeometry(
        footRadius,         // radius
        footSegments,       // widthSegments
        footSegments / 2,   // heightSegments (half the sphere)
        0,                  // phiStart
        Math.PI * 2,        // phiLength
        Math.PI / 2,        // thetaStart (start at the equator)
        Math.PI / 2         // thetaLength (go down to the pole)
    );
    const shoeColor = color === 0xff0000 ? 0x0000ff : 0xffa500; // Example shoe colors
    const footMaterial = new THREE.MeshStandardMaterial({ color: shoeColor, side: THREE.DoubleSide }); // Use DoubleSide if inside might be visible

    const leftFoot = new THREE.Mesh(footGeometry, footMaterial);
    // Scale to make it ellipsoidal (wider and longer than tall)
    leftFoot.scale.set(1.5, 0.7, 1.0); // Stretch x, squash y
    // Position floating below the torso - Adjust y slightly due to half-sphere origin
    leftFoot.position.set(-PLAYER_SIZE * 0.5, -PLAYER_SIZE * 0.6, 0);
    // Rotate so the flat part faces up
    // leftFoot.rotation.x = -Math.PI / 2; // No rotation needed with thetaStart/Length
    character.add(leftFoot);
    character.userData.leftFoot = leftFoot; // Store reference

    const rightFoot = new THREE.Mesh(footGeometry, footMaterial);
    // Scale to make it ellipsoidal (wider and longer than tall)
    rightFoot.scale.set(1.5, 0.7, 1.0); // Stretch x, squash y
    // Position floating below the torso - Adjust y slightly due to half-sphere origin
    rightFoot.position.set(PLAYER_SIZE * 0.5, -PLAYER_SIZE * 0.6, 0);
     // Rotate so the flat part faces up
    // rightFoot.rotation.x = -Math.PI / 2; // No rotation needed with thetaStart/Length
    character.add(rightFoot);
    character.userData.rightFoot = rightFoot; // Store reference


    // Add a reference to the character object itself for easy access
    character.userData.character = character;

    // Add collision box for physics (optional, adjust as needed)
    const collisionBoxGeometry = new THREE.BoxGeometry(PLAYER_SIZE * 1.5, PLAYER_SIZE * 2, PLAYER_SIZE * 1.5);
    const collisionBoxMaterial = new THREE.MeshBasicMaterial({ visible: false }); // Invisible
    const collisionBox = new THREE.Mesh(collisionBoxGeometry, collisionBoxMaterial);
    collisionBox.position.y = PLAYER_SIZE * 0.5; // Center the box around the character roughly
    character.add(collisionBox);
    character.userData.collisionBox = collisionBox;

    
    return character;
}

// Updated function for Rayman-style running animation
function updateRunningAnimation(character, speed) {
    if (!character.userData.isRaymanStyle) {
        // --- Original leg animation logic ---
        // ... (keep the original logic for non-Rayman characters if needed) ...
        // --- End of original logic ---
        return; // Exit if not Rayman style
    }

    // --- Rayman-style foot animation ---
    const userData = character.userData;
    const leftFoot = userData.leftFoot;
    const rightFoot = userData.rightFoot;

    // Base positions for feet (floating below torso)
    const baseLeftFootPos = new THREE.Vector3(-PLAYER_SIZE * 0.5, -PLAYER_SIZE * 0.5, 0);
    const baseRightFootPos = new THREE.Vector3(PLAYER_SIZE * 0.5, -PLAYER_SIZE * 0.5, 0);

    if (speed > 0.1 && userData.onGround) { // Only animate if moving significantly on the ground
        userData.isRunning = true;
        userData.runSpeed = speed;

        // Simple up/down and forward/back motion for feet
        const animationFrequency = 8; // How fast the feet move
        const verticalAmplitude = PLAYER_SIZE * 0.2; // How high the feet lift
        const horizontalAmplitude = PLAYER_SIZE * 0.3; // How far forward/back feet move

        userData.animationPhase += animationFrequency * (speed / PLAYER_SPEED) * (1/60); // Adjust phase based on speed and frame rate assumption

        // Calculate foot positions based on sine waves
        leftFoot.position.y = baseLeftFootPos.y + Math.sin(userData.animationPhase) * verticalAmplitude;
        leftFoot.position.z = baseLeftFootPos.z + Math.cos(userData.animationPhase) * horizontalAmplitude;

        rightFoot.position.y = baseRightFootPos.y + Math.sin(userData.animationPhase + Math.PI) * verticalAmplitude; // Offset phase for opposite motion
        rightFoot.position.z = baseRightFootPos.z + Math.cos(userData.animationPhase + Math.PI) * horizontalAmplitude;

    } else {
        // Reset feet to base floating positions when not running
        userData.isRunning = false;
        userData.runSpeed = 0;
        userData.animationPhase = 0; // Reset phase
        leftFoot.position.copy(baseLeftFootPos);
        rightFoot.position.copy(baseRightFootPos);
    }
}

// Updated punch animation for Rayman-style floating hands
function punchBall(character) {
    const userData = character.userData;
    if (userData.isPunching || userData.punchCooldown || userData.isStunned || userData.isAnimatingPunch) {
        return; // Prevent punching if already punching, on cooldown, stunned, or animating
    }

    userData.isPunching = true;
    userData.isAnimatingPunch = true; // Start punch animation flag
    userData.punchCooldown = true; // Start cooldown immediately

    // --- Modified Punch Animation for Rayman Style ---
    const punchHand = userData.rightHand; // Use the detached hand
    const originalHandPosition = punchHand.position.clone(); // Store original floating position
    const punchForwardDistance = PLAYER_SIZE * 1.5; // How far the hand moves forward
    const punchDuration = 0.15; // Duration of the punch forward motion (seconds)
    const returnDuration = 0.2; // Duration of the return motion (seconds)

    // Target position for the punch
    const targetPosition = originalHandPosition.clone().add(new THREE.Vector3(0, 0, punchForwardDistance));


    // Animate punch forward using GSAP (or similar animation library)
    gsap.to(punchHand.position, {
        x: targetPosition.x,
        y: targetPosition.y,
        z: targetPosition.z,
        duration: punchDuration,
        ease: "power1.out",
        onComplete: () => {
            // Animate return to original position
            gsap.to(punchHand.position, {
                x: originalHandPosition.x,
                y: originalHandPosition.y,
                z: originalHandPosition.z,
                duration: returnDuration,
                ease: "power1.in",
                onComplete: () => {
                    userData.isPunching = false; // Punch action finished
                    userData.isAnimatingPunch = false; // Animation finished
                    // Start cooldown timer
                    setTimeout(() => {
                        userData.punchCooldown = false;
                    }, 500); // 500ms cooldown
                }
            });
        }
    });

    // --- Head animation remains the same ---
    // animateHeadForPunch(character); // Keep head animation if desired
}

// Create ball
function createBall() {
    // Create a simple ball without using a group
    const geometry = new THREE.SphereGeometry(BALL_SIZE, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
        color: 0xffff00,
        emissive: 0xffaa00,
        emissiveIntensity: 0.3
    });
    
    // Create the ball mesh directly
    const ball = new THREE.Mesh(geometry, material);
    
    // Initialize with userData
    ball.userData = {
        originalScale: BALL_SIZE,
        mesh: ball,
        trail: []
    };
    
    // Try positioning at exact (0,0,0) initially
    ball.position.set(0, 0, 0);
    
    return ball;
}

// Reset ball position and velocity
function resetBall() {
    // Check if ball has a parent
    if (ball.parent && ball.parent !== scene) {
        console.log("WARNING: Ball has a parent that's not the scene!");
    }

    // Calculate the Z offset for the current court
    const middleCourtIndex = Math.floor(totalCourts / 2);
    const zOffset = (currentCourtIndex - middleCourtIndex) * COURT_LENGTH;

    // Set the ball at the center of the current court's Z position
    ball.position.x = 0; // Horizontal center
    ball.position.y = -PLAYER_SIZE + BALL_SIZE + 50; // Start above the floor, but not too high
    ball.position.z = -zOffset; // Center depth-wise for the current court - REVERSED
    
    // Flag to skip constraint check for one frame
    ball.userData.skipConstraints = true;
    
    // Force update the matrix to ensure the position is applied
    ball.updateMatrix();
    ball.updateMatrixWorld(true);
    
    // Set initial velocity to zero (immobile)
    ballVelocity.x = 0;
    ballVelocity.y = 0;
    ballVelocity.z = 0;
    
    // Clear any existing ball trail
    for (let i = ball.userData.trail.length - 1; i >= 0; i--) {
        scene.remove(ball.userData.trail[i]);
    }
    ball.userData.trail = [];
}

// Create UI elements
function createUI() {
    // Create pause button
    const pauseBtn = document.createElement('button');
    pauseBtn.id = 'pause-button';
    pauseBtn.textContent = '⏸️';
    pauseBtn.style.position = 'absolute';
    pauseBtn.style.top = '20px';
    pauseBtn.style.right = '20px';
    pauseBtn.style.zIndex = '100';
    pauseBtn.style.fontSize = '24px';
    pauseBtn.style.padding = '5px 10px';
    pauseBtn.style.background = 'rgba(255, 255, 255, 0.7)';
    pauseBtn.style.border = 'none';
    pauseBtn.style.borderRadius = '5px';
    pauseBtn.style.cursor = 'pointer';
    document.getElementById('game-container').appendChild(pauseBtn);
    
    // Add help message explaining the goal
    const helpMessage = document.createElement('div');
    helpMessage.id = 'help-message';
    helpMessage.style.position = 'absolute';
    helpMessage.style.bottom = '20px';
    helpMessage.style.left = '50%';
    helpMessage.style.transform = 'translateX(-50%)';
    helpMessage.style.color = 'white';
    helpMessage.style.fontSize = '16px';
    helpMessage.style.zIndex = '100';
    helpMessage.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
    helpMessage.style.backgroundColor = 'rgba(0,0,0,0.5)';
    helpMessage.style.padding = '10px';
    helpMessage.style.borderRadius = '5px';
    helpMessage.innerHTML = 'Break the enemy wall by hitting it with the ball! The stronger your shots, the more damage they do!';
    
    document.getElementById('game-container').appendChild(helpMessage);
    
    // Create charge indicator
    const chargeIndicator = document.createElement('div');
    chargeIndicator.id = 'charge-indicator';
    chargeIndicator.style.position = 'absolute';
    chargeIndicator.style.bottom = '20px';
    chargeIndicator.style.left = '50%';
    chargeIndicator.style.transform = 'translateX(-50%)';
    chargeIndicator.style.width = '200px';
    chargeIndicator.style.height = '20px';
    chargeIndicator.style.background = 'rgba(0, 0, 0, 0.5)';
    chargeIndicator.style.border = '2px solid white';
    chargeIndicator.style.borderRadius = '10px';
    chargeIndicator.style.overflow = 'hidden';
    chargeIndicator.style.display = 'none';
    
    const chargeFill = document.createElement('div');
    chargeFill.id = 'charge-fill';
    chargeFill.style.width = '0%';
    chargeFill.style.height = '100%';
    chargeFill.style.background = 'linear-gradient(90deg, #ff0, #f00)';
    chargeFill.style.transition = 'width 0.1s linear';
    chargeIndicator.appendChild(chargeFill);
    
    document.getElementById('game-container').appendChild(chargeIndicator);
    
    // Create pause menu
    const pauseMenu = document.createElement('div');
    pauseMenu.id = 'pause-menu';
    pauseMenu.style.position = 'absolute';
    pauseMenu.style.top = '0';
    pauseMenu.style.left = '0';
    pauseMenu.style.width = '100%';
    pauseMenu.style.height = '100%';
    pauseMenu.style.background = 'rgba(0, 0, 0, 0.7)';
    pauseMenu.style.display = 'flex';
    pauseMenu.style.justifyContent = 'center';
    pauseMenu.style.alignItems = 'center';
    pauseMenu.style.zIndex = '200';
    pauseMenu.style.display = 'none';
    
    const pauseContent = document.createElement('div');
    pauseContent.style.background = 'white';
    pauseContent.style.padding = '20px';
    pauseContent.style.borderRadius = '10px';
    pauseContent.style.textAlign = 'center';
    
    const pauseTitle = document.createElement('h2');
    pauseTitle.textContent = 'Game Paused';
    pauseContent.appendChild(pauseTitle);
    
    const resumeBtn = document.createElement('button');
    resumeBtn.textContent = 'Resume Game';
    resumeBtn.style.margin = '10px';
    resumeBtn.style.padding = '10px 20px';
    resumeBtn.style.background = '#4CAF50';
    resumeBtn.style.color = 'white';
    resumeBtn.style.border = 'none';
    resumeBtn.style.borderRadius = '5px';
    resumeBtn.style.cursor = 'pointer';
    pauseContent.appendChild(resumeBtn);
    
    pauseMenu.appendChild(pauseContent);
    document.getElementById('game-container').appendChild(pauseMenu);
    
    // Create score display with more details
    const scoreDetails = document.createElement('div');
    scoreDetails.id = 'score-details';
    scoreDetails.style.position = 'absolute';
    scoreDetails.style.top = '20px';
    scoreDetails.style.left = '20px';
    scoreDetails.style.color = 'white';
    scoreDetails.style.fontSize = '18px';
    scoreDetails.style.zIndex = '100';
    scoreDetails.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
    scoreDetails.innerHTML = `
        <div>Your Wins: <span id="player-wins">0</span></div>
        <div>Opponent Wins: <span id="enemy-wins">0</span></div>
        <div>Your Wall: <span id="player-wall-health">${WALL_MAX_HP}</span>/${WALL_MAX_HP}</div>
        <div>Enemy Wall: <span id="enemy-wall-health">${WALL_MAX_HP}</span>/${WALL_MAX_HP}</div>
    `;
    document.getElementById('game-container').appendChild(scoreDetails);
    
    // Initialize UI element references
    playerHealthEl = document.getElementById('player-wall-health');
    enemyHealthEl = document.getElementById('enemy-wall-health');
    
    // Create combo display
    const comboDisplay = document.createElement('div');
    comboDisplay.id = 'combo-display';
    comboDisplay.style.position = 'absolute';
    comboDisplay.style.top = '120px';
    comboDisplay.style.left = '20px';
    comboDisplay.style.color = 'white';
    comboDisplay.style.fontSize = '18px';
    comboDisplay.style.zIndex = '100';
    comboDisplay.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
    comboDisplay.innerHTML = `
        <div>Combo: <span id="combo-value">0</span></div>
    `;
    comboDisplay.style.opacity = '0';
    document.getElementById('game-container').appendChild(comboDisplay);
    
    // Add event listeners for pause functionality
    pauseBtn.addEventListener('click', togglePause);
    resumeBtn.addEventListener('click', togglePause);
    window.addEventListener('keydown', function(e) {
        if (e.code === 'Escape') {
            togglePause();
        }
    });

    // Add mobile controls only if on mobile device
    if (isMobile) {
        // Add label for Y-axis control
        const yAxisLabel = document.createElement('div');
        yAxisLabel.style.position = 'absolute';
        yAxisLabel.style.bottom = '220px';
        yAxisLabel.style.right = '100px';
        yAxisLabel.style.width = '120px';
        yAxisLabel.style.textAlign = 'center';
        yAxisLabel.style.color = 'white';
        yAxisLabel.style.fontFamily = 'Arial, sans-serif';
        yAxisLabel.style.fontSize = '14px';
        yAxisLabel.textContent = 'Pull Down to Fly Up';
        document.getElementById('game-container').appendChild(yAxisLabel);

        // Add boost button for mobile
        const boostBtn = document.createElement('button');
        boostBtn.id = 'boost-button';
        boostBtn.textContent = '💨';
        boostBtn.style.position = 'absolute';
        boostBtn.style.bottom = '50px';
        boostBtn.style.right = '50px';
        boostBtn.style.width = '60px';
        boostBtn.style.height = '60px';
        boostBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        boostBtn.style.border = '2px solid white';
        boostBtn.style.borderRadius = '50%';
        boostBtn.style.fontSize = '24px';
        boostBtn.style.color = 'white';
        boostBtn.style.zIndex = '100';
        document.getElementById('game-container').appendChild(boostBtn);

        // Boost button event listeners
        boostBtn.addEventListener('touchstart', () => {
            boostActive = true;
        });

        boostBtn.addEventListener('touchend', () => {
            boostActive = false;
        });

        // For desktop testing of mobile mode - removed
    }
    
    // Add position display element
    const positionDisplay = document.createElement('div');
    positionDisplay.id = 'position-display';
    positionDisplay.style.position = 'absolute';
    positionDisplay.style.bottom = '10px';
    positionDisplay.style.left = '10px';
    positionDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    positionDisplay.style.color = 'white';
    positionDisplay.style.padding = '5px 10px';
    positionDisplay.style.borderRadius = '5px';
    positionDisplay.style.fontFamily = 'monospace';
    positionDisplay.style.fontSize = '14px';
    positionDisplay.style.zIndex = '100';
    document.getElementById('game-container').appendChild(positionDisplay);
}

// Toggle pause state
function togglePause() {
    // Pause might need server-side logic if it should pause for both players
    gamePaused = !gamePaused;
    
    const pauseMenu = document.getElementById('pause-menu');
    if (gamePaused) {
        pauseMenu.style.display = 'flex';
    } else {
        pauseMenu.style.display = 'none';
    }
}

// Set up controls (keyboard and touch)
function setupControls() {
    // Keyboard controls
    const keyState = {};
    
    window.addEventListener('keydown', function(e) {
        keyState[e.code] = true;
        
        // Start charging when E is pressed
        if (e.code === 'KeyE' && !isCharging && socket) {
            isCharging = true;
            chargeStartTime = Date.now();
            chargePower = MIN_CHARGE_POWER;
            // Tell the server we started charging
            socket.emit('charge_start');
            // Arrow is handled locally in animate()
        }

        // Added Escape key for pause toggle (also handled in togglePause)
        // Consider if pause needs server sync
        if (e.code === 'Escape') {
            togglePause();
        }

         // Restart Game (Needs multiplayer logic)
        if (e.code === 'Space' && !gameRunning) {
            // TODO: Implement multiplayer restart
            // restartGame();
            console.log("Restart functionality needs multiplayer update.");
        }
    });
    
    window.addEventListener('keyup', function(e) {
        keyState[e.code] = false;
        
        // Release charge and punch when E is released
        if (e.code === 'KeyE' && isCharging && socket) {
            isCharging = false;
            // Hide the arrow immediately on key release
            if (shotDirectionArrow) {
                shotDirectionArrow.visible = false;
            }
            // Trigger LOCAL punch animation for visual feedback
            if (player && player.userData && gameRunning && !gamePaused) {
                 punchBall(player);
            }
            // Send punch event to server with current charge power
            socket.emit('punch', { chargePower: chargePower });

            // Reset local charge power visual
            chargePower = MIN_CHARGE_POWER;
            const chargeIndicator = document.getElementById('charge-indicator');
            if (chargeIndicator) {
                chargeIndicator.style.display = 'none';
            }
        }
    });
    
    // Process keyboard input (Called in animate loop)
    function processKeyboardInput() {
        if (!player) return; // Don't process input if player isn't created yet

        // Calculate intended velocity based on keys
        let intendedVelX = 0;
        let intendedVelY = playerVelocity.y; // Keep local vertical velocity for gravity/jump prediction
        let intendedVelZ = 0;
        
        // Check if boost is active
        boostActive = keyState['ShiftLeft'] || keyState['ShiftRight'];
        const currentSpeed = boostActive ? PLAYER_BOOST_SPEED : PLAYER_SPEED;
        
        // Calculate horizontal movement intention adjusted by player number
        // For Player 1, controls are standard; for Player 2, they're adapted to match their camera
        if (myPlayerNumber === 1) {
            // Player 1 controls (standard)
            if (keyState['ArrowUp']) intendedVelZ = currentSpeed * KEYBOARD_SENSITIVITY; // Forward
            if (keyState['ArrowDown']) intendedVelZ = -currentSpeed * KEYBOARD_SENSITIVITY; // Backward
            if (keyState['ArrowLeft']) intendedVelX = currentSpeed * KEYBOARD_SENSITIVITY; // Left
            if (keyState['ArrowRight']) intendedVelX = -currentSpeed * KEYBOARD_SENSITIVITY; // Right
        } else {
            // Player 2 controls (reversed Z, also reversed X due to character rotation)
            if (keyState['ArrowUp']) intendedVelZ = -currentSpeed * KEYBOARD_SENSITIVITY; // Forward (negative Z for Player 2)
            if (keyState['ArrowDown']) intendedVelZ = currentSpeed * KEYBOARD_SENSITIVITY; // Backward (positive Z for Player 2)
            if (keyState['ArrowLeft']) intendedVelX = -currentSpeed * KEYBOARD_SENSITIVITY; // Left (flipped due to 180° rotation)
            if (keyState['ArrowRight']) intendedVelX = currentSpeed * KEYBOARD_SENSITIVITY; // Right (flipped due to 180° rotation)
        }
        
        // Handle Y axis with Space key for flying up - local prediction
        if (keyState['Space']) {
            intendedVelY = PLAYER_FLIGHT_SPEED; // Apply upward velocity
        } else {
            // Apply gravity to local playerVelocity for prediction
            intendedVelY -= PLAYER_GRAVITY; // Fall down (negative Y)
        }

        // -- Client-Side Prediction --
        // Update local player velocity
        playerVelocity.x = intendedVelX;
        playerVelocity.y = intendedVelY;
        playerVelocity.z = intendedVelZ;

        // Apply local movement immediately for responsiveness
        player.position.x += playerVelocity.x;
        player.position.y += playerVelocity.y;
        player.position.z += playerVelocity.z;

        // Constrain locally predicted position
        constrainPosition(player); 

        // -- Send Input to Server --
        // Send movement data if input is active or velocity is non-zero
        if (socket && (keyState['ArrowUp'] || keyState['ArrowDown'] || keyState['ArrowLeft'] || keyState['ArrowRight'] || keyState['Space'] || playerVelocity.lengthSq() > 0.01)) {
            socket.emit('player_move', {
                position: { x: player.position.x, y: player.position.y, z: player.position.z },
                // Send the calculated *intended* velocity, not the gravity-affected one yet
                velocity: { x: intendedVelX, y: (keyState['Space'] ? PLAYER_FLIGHT_SPEED : 0), z: intendedVelZ } 
            });
        }
    }
    
    // Touch/joystick controls for mobile - TODO: Needs similar emission logic
    if (isMobile) {
        const joystickContainer = document.createElement('div');
        joystickContainer.id = 'joystick-container';
        joystickContainer.style.position = 'absolute';
        joystickContainer.style.bottom = '100px';
        joystickContainer.style.left = '100px';
        joystickContainer.style.width = '120px';
        joystickContainer.style.height = '120px';
        document.getElementById('game-container').appendChild(joystickContainer);
        
        joystick = nipplejs.create({
            zone: joystickContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120
        });
        
        // Create second joystick container for height control
        const joystickYContainer = document.createElement('div');
        joystickYContainer.id = 'joystick-y-container';
        joystickYContainer.style.position = 'absolute';
        joystickYContainer.style.bottom = '100px';
        joystickYContainer.style.right = '100px';
        joystickYContainer.style.width = '120px';
        joystickYContainer.style.height = '120px';
        document.getElementById('game-container').appendChild(joystickYContainer);
        
        // Add label for Y-axis control
        const yAxisLabel = document.createElement('div');
        yAxisLabel.style.position = 'absolute';
        yAxisLabel.style.bottom = '220px';
        yAxisLabel.style.right = '100px';
        yAxisLabel.style.width = '120px';
        yAxisLabel.style.textAlign = 'center';
        yAxisLabel.style.color = 'white';
        yAxisLabel.style.fontFamily = 'Arial, sans-serif';
        yAxisLabel.style.fontSize = '14px';
        yAxisLabel.textContent = 'Pull Down to Fly Up';
        document.getElementById('game-container').appendChild(yAxisLabel);
        
        // Create second joystick for height control
        const joystickY = nipplejs.create({
            zone: joystickYContainer,
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120
        });
        
        // Add boost button for mobile
        const boostBtn = document.createElement('button');
        boostBtn.id = 'boost-button';
        boostBtn.textContent = '💨';
        boostBtn.style.position = 'absolute';
        boostBtn.style.bottom = '50px';
        boostBtn.style.right = '50px';
        boostBtn.style.width = '60px';
        boostBtn.style.height = '60px';
        boostBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
        boostBtn.style.border = '2px solid white';
        boostBtn.style.borderRadius = '50%';
        boostBtn.style.fontSize = '24px';
        boostBtn.style.color = 'white';
        boostBtn.style.zIndex = '100';
        document.getElementById('game-container').appendChild(boostBtn);
        
        // Boost button event listeners
        boostBtn.addEventListener('touchstart', () => {
            boostActive = true;
        });
        
        boostBtn.addEventListener('touchend', () => {
            boostActive = false;
        });
        
        // For desktop testing
        boostBtn.addEventListener('mousedown', () => {
            boostActive = true;
        });
        
        boostBtn.addEventListener('mouseup', () => {
            boostActive = false;
        });
        
        // Listen to joystick events
        joystick.on('move', function(evt, data) {
            if (!player || !socket) return;
            const force = Math.min(data.force, 1);
            const speed = boostActive ? PLAYER_BOOST_SPEED : PLAYER_SPEED;
            
            let intendedVelX, intendedVelZ;
            
            if (myPlayerNumber === 1) {
                // Player 1 controls (standard)
                intendedVelX = -data.vector.x * speed * force; // X is inverted in joystick
                intendedVelZ = -data.vector.y * speed * force; // Y maps to Z and is inverted
            } else {
                // Player 2 controls (reversed Z and X due to 180° rotation)
                intendedVelX = data.vector.x * speed * force; // X is flipped for Player 2
                intendedVelZ = data.vector.y * speed * force; // Y maps to Z but sign is flipped for Player 2
            }

            // Local prediction
            playerVelocity.x = intendedVelX;
            playerVelocity.z = intendedVelZ;
            player.position.x += playerVelocity.x;
            player.position.z += playerVelocity.z;
            constrainPosition(player);

            // Emit
             socket.emit('player_move', {
                position: { x: player.position.x, y: player.position.y, z: player.position.z },
                velocity: { x: intendedVelX, y: playerVelocity.y, z: intendedVelZ } // Use current Y vel
            });
        });
        
        joystick.on('end', function() {
             if (!player || !socket) return;
            // Stop horizontal movement locally
            playerVelocity.x = 0;
            playerVelocity.z = 0;

             // Emit final position and zero velocity
             socket.emit('player_move', {
                position: { x: player.position.x, y: player.position.y, z: player.position.z },
                velocity: { x: 0, y: playerVelocity.y, z: 0 } // Keep Y vel
            });
        });
        
        joystickY.on('move', function(evt, data) {
            if (!player || !socket) return;
            const force = Math.min(data.force, 1);
            let intendedVelY = playerVelocity.y; // Start with current Y vel
            // Only allow flying up when pulling down on the joystick
            if (data.vector.y > 0) {
                intendedVelY = data.vector.y * PLAYER_FLIGHT_SPEED * force;
            } else {
                // Apply gravity when joystick is not pulled down (local prediction)
                intendedVelY -= PLAYER_GRAVITY;
            }

             // Local prediction
            playerVelocity.y = intendedVelY;
            player.position.y += playerVelocity.y;
            constrainPosition(player);

             // Emit
             socket.emit('player_move', {
                position: { x: player.position.x, y: player.position.y, z: player.position.z },
                velocity: { x: playerVelocity.x, y: intendedVelY, z: playerVelocity.z }
            });
        });
        
        joystickY.on('end', function() {
            if (!player || !socket) return;
            // Apply gravity when joystick is released (local prediction)
            playerVelocity.y -= PLAYER_GRAVITY;
             // No need to explicitly set to -GRAVITY, just let gravity take over

             // Emit final state
             socket.emit('player_move', {
                position: { x: player.position.x, y: player.position.y, z: player.position.z },
                velocity: { x: playerVelocity.x, y: playerVelocity.y, z: playerVelocity.z } // Send current velocity
            });
        });
        
        // TODO: Add touch listeners for boost and punch buttons to emit events

    } else {
        // Add restart button event listener for desktop (needs multiplayer update)
        // document.getElementById('restart-button').addEventListener('click', restartGame);
    }
    
    // Export the processKeyboardInput function for animation loop
    return processKeyboardInput;
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Update camera position to follow player
function updateCamera() {
    // Calculate target camera position behind and above player
    const targetCameraPos = new THREE.Vector3(
        player.position.x,              // Same X as player
        player.position.y + cameraOffset.y, // Higher Y (above player)
        // Adjust Z offset based on player number
        player.position.z + (myPlayerNumber === 1 ? -cameraOffset.z : cameraOffset.z)  // Behind for player 1, in front for player 2
    );
    
    // During transitions, move camera immediately instead of smoothly
    if (isTransitioning) {
        camera.position.copy(targetCameraPos);
    } else {
        // Smoothly interpolate camera position
        camera.position.lerp(targetCameraPos, CAMERA_FOLLOW_SPEED);
    }
    
    // Look at point in front of player - direction depends on player number
    const lookAtPos = new THREE.Vector3(
        player.position.x,
        player.position.y,         // Same Y level (not looking up/down)
        player.position.z + (myPlayerNumber === 1 ? ARENA_LENGTH / 4 : -ARENA_LENGTH / 4)  // Look ahead (opposite direction for player 2)
    );
    
    camera.lookAt(lookAtPos);
}

// Create wall breaking animation
function createWallBreakAnimation(wallMesh) {
    if (!wallMesh) return;
    
    // Make the original wall invisible
    wallMesh.visible = false;
    
    // Create particle system for wall break effect
    const particleCount = 100;
    const particles = new THREE.Group();
    
    // Create particle geometry
    const particleGeometry = new THREE.BoxGeometry(5, 5, 5);
    
    // Create particle material - use wall color
    const particleMaterial = new THREE.MeshPhongMaterial({
        color: WALL_COLOR,
        transparent: true,
        opacity: 0.9
    });
    
    // Wall dimensions and position
    const wallWidth = STADIUM_WIDTH;
    const wallHeight = WALL_HEIGHT;
    const wallPos = wallMesh.position.clone();
    
    // Create particles with random velocities to simulate wall breaking
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
        
        // Position particles along the wall with random offsets
        particle.position.set(
            wallPos.x + (Math.random() - 0.5) * wallWidth,
            wallPos.y + (Math.random() - 0.5) * wallHeight,
            wallPos.z
        );
        
        // Generate random velocity for particle explosion
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        );
        
        // Add stronger impulse in direction away from center
        const dirFromCenter = new THREE.Vector3();
        dirFromCenter.subVectors(particle.position, wallPos).normalize();
        velocity.add(dirFromCenter.multiplyScalar(Math.random() * 2 + 1));
        
        // Store velocity with particle
        particle.userData = {
            velocity: velocity,
            rotation: new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize().multiplyScalar(0.1)
        };
        
        particles.add(particle);
    }
    
    // Add particles to scene
    scene.add(particles);
    wallBreakParticles.push(particles);
    
    // Add screen flash effect
    flashScreen('rgba(0, 100, 255, 0.3)');
    
    // Animate particles
    const startTime = Date.now();
    const duration = 3000; // 3 seconds animation
    
    function animateParticles() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress < 1.0) {
            // Update each particle
            particles.children.forEach(particle => {
                // Move according to velocity
                particle.position.add(particle.userData.velocity);
                
                // Add gravity
                particle.userData.velocity.y -= 0.02;
                
                // Add rotation
                particle.rotation.x += particle.userData.rotation.x;
                particle.rotation.y += particle.userData.rotation.y;
                particle.rotation.z += particle.userData.rotation.z;
                
                // Fade out
                if (progress > 0.7) {
                    const fadeProgress = (progress - 0.7) / 0.3;
                    particle.material.opacity = 0.9 * (1 - fadeProgress);
                }
            });
            
            requestAnimationFrame(animateParticles);
        } else {
            // Remove particles when animation is complete
            scene.remove(particles);
            const index = wallBreakParticles.indexOf(particles);
            if (index > -1) {
                wallBreakParticles.splice(index, 1);
            }
        }
    }
    
    // Start animation
    animateParticles();
}

// Flash the screen with a color overlay
function flashScreen(color) {
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = color;
    flash.style.zIndex = '90';
    flash.style.pointerEvents = 'none';
    document.getElementById('game-container').appendChild(flash);
    
    // Fade out and remove
    setTimeout(() => {
        flash.style.transition = 'opacity 0.5s';
        flash.style.opacity = '0';
        setTimeout(() => {
            flash.remove();
        }, 500);
    }, 100);
}

// Create visual effect for power shot
function createPowerShotEffect(position) {
    // Create particle burst at ball position
    const particleCount = 15;
    const particles = new THREE.Group();
    
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(
            new THREE.SphereGeometry(BALL_SIZE * 0.3, 8, 8),
            new THREE.MeshBasicMaterial({ 
                color: 0xffff00,
                transparent: true,
                opacity: 0.8
            })
        );
        
        // Random position around ball
        const angle = Math.random() * Math.PI * 2;
        const radius = BALL_SIZE * 2;
        particle.position.set(
            position.x + Math.cos(angle) * radius,
            position.y + Math.random() * radius,
            position.z + Math.sin(angle) * radius
        );
        
        // Store animation parameters
        particle.userData = {
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.3
            ),
            life: 1.0
        };
        
        particles.add(particle);
    }
    
    scene.add(particles);
    
    // Animate particles
    const startTime = Date.now();
    const duration = 500; // milliseconds
    
    function animateParticles() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress >= 1) {
            scene.remove(particles);
            return;
        }
        
        // Update each particle
        particles.children.forEach(particle => {
            // Move according to velocity
            particle.position.add(particle.userData.velocity);
            
            // Fade out
            particle.material.opacity = (1 - progress) * 0.8;
            
            // Shrink
            const scale = 1 - progress;
            particle.scale.set(scale, scale, scale);
        });
        
        requestAnimationFrame(animateParticles);
    }
    
    animateParticles();
}

// Create visual effect for critical hit
function createCriticalHitEffect(position) {
    // Create a special particle effect for critical hits
    const particleCount = 25;
    const particles = new THREE.Group();
    scene.add(particles);
    
    // Create explosion particles
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(
            new THREE.SphereGeometry(BALL_SIZE * 0.4, 8, 8),
            new THREE.MeshBasicMaterial({ 
                color: 0xFF0000, // Red particles for punch hit
                transparent: true,
                opacity: 0.8
            })
        );
        
        // Set random initial position around hit point in a sphere
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.random() * Math.PI;
        const radius = Math.random() * 2;
        
        particle.position.set(
            position.x + radius * Math.sin(theta) * Math.cos(phi),
            position.y + radius * Math.sin(theta) * Math.sin(phi), 
            position.z + radius * Math.cos(theta)
        );
        
        // Random velocity - explode outward from center
        const speed = 0.1 + Math.random() * 0.2;
        particle.userData = {
            velocity: new THREE.Vector3(
                (particle.position.x - position.x) * speed,
                (particle.position.y - position.y) * speed,
                (particle.position.z - position.z) * speed
            ),
            age: 0
        };
        
        particles.add(particle);
    }
    
    // Add shock wave ring
    const ringGeometry = new THREE.RingGeometry(0.1, 0.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFF5500, 
        transparent: true, 
        opacity: 0.8,
        side: THREE.DoubleSide
    });
    
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(position);
    ring.lookAt(camera.position); // Face the camera
    ring.userData = { scale: 0.1 };
    particles.add(ring);
    
    // Animate particles
    const startTime = Date.now();
    function animateCriticalHitEffect() {
        const elapsed = Date.now() - startTime;
        const duration = 800;
        
        if (elapsed < duration) {
            const progress = elapsed / duration;
            
            // Update normal particles
            particles.children.forEach((particle, index) => {
                if (index === particles.children.length - 1) {
                    // This is the ring
                    const ringScale = 0.1 + progress * 10;
                    particle.scale.set(ringScale, ringScale, ringScale);
                    particle.material.opacity = 0.8 * (1 - progress);
                    
                    // Keep facing the camera
                    particle.lookAt(camera.position);
                } else {
                    // Regular particles
                    particle.position.add(particle.userData.velocity);
                    
                    // Add gravity effect
                    particle.userData.velocity.y -= 0.003;
                    
                    // Increase age
                    particle.userData.age += 0.015;
                    
                    // Shrink and fade
                    const scale = 1 - particle.userData.age;
                    if (scale > 0) {
                        particle.scale.set(scale, scale, scale);
                        particle.material.opacity = 0.8 * (1 - particle.userData.age);
                    }
                    
                    // Add a pulsing color effect
                    particle.material.color.setHSL(
                        (elapsed / 1000) % 1 * 0.1, // Cycle through red-orange hues
                        1,
                        0.5 + Math.sin(elapsed * 0.01) * 0.2 // Pulsing brightness
                    );
                }
            });
            
            requestAnimationFrame(animateCriticalHitEffect);
        } else {
            // Remove particles from scene
            scene.remove(particles);
        }
    }
    
    animateCriticalHitEffect();
    
    // Add screen flash effect for critical hit
    flashScreen('rgba(255, 0, 0, 0.2)');
}

// Update combo display
function updateComboDisplay() {
    document.getElementById('combo-value').textContent = consecutiveHits;
    
    const comboDisplay = document.getElementById('combo-display');
    
    // Show or hide combo display based on consecutive hits
    if (consecutiveHits > 1) {
        comboDisplay.style.opacity = '1';
        
        // Flash effect for combo
        const comboElement = document.getElementById('combo-value');
        comboElement.style.fontSize = '24px';
        comboElement.style.color = '#ffff00';
        
        // Reset after animation
        setTimeout(() => {
            comboElement.style.fontSize = '18px';
            comboElement.style.color = 'white';
        }, 300);
    } else {
        comboDisplay.style.opacity = '0';
    }
}

// Add points to score
function addPoints(points) {
    score += points;
    document.getElementById('score-value').textContent = score;
    
    // Create floating score text
    if (points > 0) {
        const floatingText = document.createElement('div');
        floatingText.textContent = `+${points}`;
        floatingText.style.position = 'absolute';
        floatingText.style.left = '50%';
        floatingText.style.top = '40%';
        floatingText.style.transform = 'translate(-50%, -50%)';
        floatingText.style.color = '#ffff00';
        floatingText.style.fontSize = '24px';
        floatingText.style.fontWeight = 'bold';
        floatingText.style.zIndex = '150';
        floatingText.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
        document.getElementById('game-container').appendChild(floatingText);
        
        // Animate and remove
        let opacity = 1;
        let top = 40;
        const fadeInterval = setInterval(() => {
            opacity -= 0.05;
            top -= 1;
            floatingText.style.opacity = opacity;
            floatingText.style.top = `${top}%`;
            
            if (opacity <= 0) {
                clearInterval(fadeInterval);
                floatingText.remove();
            }
        }, 30);
    }
}

// Enemy scores a goal
function enemyScores() {
    // Increment enemy goal counter
    enemyGoals++;
    
    // Update display
    document.getElementById('enemy-goals-value').textContent = enemyGoals;
    
    // Check if enemy reached goal limit
    if (enemyGoals >= GOAL_LIMIT) {
        // Game lost
        gameLost();
    } else {
        // Flash the screen red for enemy goal
        flashScreen('rgba(255, 0, 0, 0.3)');
        
        // Reset ball and continue
        resetBall();
    }
}

// Game lost - enemy reached goal limit
function gameLost() {
    gameRunning = false;
    
    // Update game over screen with defeat message
    const gameOverTitle = document.querySelector('#game-over h2');
    if (gameOverTitle) {
        gameOverTitle.textContent = 'Game Over';
    }
    
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over').classList.remove('hidden');
}

// Increment score when player scores a goal
function incrementScore() {
    // Award points for scoring a goal
    const goalPoints = POINTS_PER_GOAL * (consecutiveHits + 1);
    addPoints(goalPoints);
    
    // Increment goal counter
    goalsScored++;
    
    // Update goals display
    document.getElementById('goals-value').textContent = goalsScored;
    
    // Flash the screen green for player goal
    flashScreen('rgba(0, 255, 0, 0.3)');
    
    // Reset consecutive hits after goal
    consecutiveHits = 0;
    lastHitter = null;
    updateComboDisplay();
    
    // Check if goal limit reached
    if (goalsScored >= GOAL_LIMIT) {
        // Game won
        gameWon();
    } else {
        // Continue play with a new ball
        resetBall();
    }
}

// Game won function - player reached the goal limit
function gameWon() {
    gameRunning = false;
    
    // Update game over screen with victory message
    const gameOverTitle = document.querySelector('#game-over h2');
    if (gameOverTitle) {
        gameOverTitle.textContent = 'Victory!';
    }
    
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over').classList.remove('hidden');
}

// Restart the game
function restartGame() {
    // Remove game over message if it exists
    const gameOverMessage = document.getElementById('game-over-message');
    if (gameOverMessage) {
        document.getElementById('game-container').removeChild(gameOverMessage);
    }
    
    // Get current court Z offset
    const middleCourtIndex = Math.floor(totalCourts / 2);
    const currentZOffset = (currentCourtIndex - middleCourtIndex) * COURT_LENGTH;
    
    // Reset player and enemy positions
    player.position.set(0, PLAYER_SIZE * 2, currentZOffset - COURT_LENGTH/2 + PLAYER_SIZE * 3); // Back of court
    enemy.position.set(0, PLAYER_SIZE * 2, currentZOffset + COURT_LENGTH/2 - PLAYER_SIZE * 3); // Front of court
    
    // Reset player velocity
    playerVelocity.set(0, 0, 0);
    
    // Reset ball
    resetBall();
    
    // Reset scores
    score = 0;
    goalsScored = 0;
    enemyGoals = 0;
    
    // Reset wall health
    playerWallHealth = WALL_MAX_HP;
    enemyWallHealth = WALL_MAX_HP;
    
    // Update display
    document.getElementById('score-value').textContent = score;
    document.getElementById('player-wall-health').textContent = playerWallHealth;
    document.getElementById('enemy-wall-health').textContent = enemyWallHealth;
    
    // Reset wall appearance
    scene.children.forEach(child => {
        if (child.userData && child.userData.isBackWall) {
            // Reset wall health
            child.userData.health = WALL_MAX_HP;
            
            // Reset wall material (no damage appearance)
            child.material.color.set(WALL_COLOR);
            child.material.opacity = 0.8;
        }
    });
    
    // Resume game
    gameRunning = true;
}

// Constrain position to arena
function constrainPosition(object) {
    // Skip constraints if the flag is set (only relevant for characters during transitions)
    if (object.userData && object.userData.skipCourtConstraints) {
        return;
    }

    const boundaryOffset = PLAYER_SIZE;
    const isBall = (object === ball); // Check if the object is the ball
    
    // Constrain X (left/right)
    object.position.x = Math.max(-STADIUM_WIDTH / 2 + boundaryOffset, Math.min(STADIUM_WIDTH / 2 - boundaryOffset, object.position.x));
    
    // Constrain Y (up/down) - Floor is now at -PLAYER_SIZE and ceiling at STADIUM_HEIGHT
    object.position.y = Math.max(-PLAYER_SIZE + boundaryOffset, Math.min(STADIUM_HEIGHT - boundaryOffset, object.position.y));
    
    // --- NEW: Only constrain Z for players/enemies --- 
    if (!isBall) {
        // Get current court Z offset based on client's currentCourtIndex
        const middleCourtIndex = Math.floor(totalCourts / 2);
        const currentZOffset = (currentCourtIndex - middleCourtIndex) * COURT_LENGTH;
        // Define the current court boundaries
        const courtMinZ = currentZOffset - COURT_LENGTH/2 + boundaryOffset;
        const courtMaxZ = currentZOffset + COURT_LENGTH/2 - boundaryOffset;
        // Constrain player and enemy to current court boundaries
        object.position.z = Math.max(courtMinZ, Math.min(courtMaxZ, object.position.z));
    } // --- END Z constraint modification ---
}

// Add trail effect for fast-moving balls
function updateBallTrail() {
    const speed = ballVelocity.length();
    
    // Only add trail when ball is moving fast - adjusted for new speed values
    if (speed > BALL_SPEED * 2.5) { // Increased from 2.0 to only show trail at higher speeds
        const trailIntensity = Math.min((speed - BALL_SPEED * 2.5) / (MAX_SHOT_SPEED - BALL_SPEED * 2.5), 1.2);
        
        // Create trail particle at current position
        if (Math.random() < trailIntensity * 0.8) { // Decreased from 0.9 for fewer trail particles
            
            // Dynamic trail color based on speed
            let trailColor = 0xffff00; // Default yellow
            
            // Change color for super fast balls - adjusted thresholds
            if (speed > MAX_SHOT_SPEED * 1.3) {
                trailColor = 0xff2200; // Red-orange for super fast shots
            } else if (speed > MAX_SHOT_SPEED * 0.8) {
                trailColor = 0xff9900; // Orange for fast shots
            }
            
            const trailParticle = new THREE.Mesh(
                new THREE.SphereGeometry(BALL_SIZE * 0.8, 16, 16),
                new THREE.MeshBasicMaterial({
                    color: trailColor,
                    transparent: true,
                    opacity: 0.6 * trailIntensity // Increased from 0.5 for more visible trails
                })
            );
            
            // Position at ball's current position
            trailParticle.position.copy(ball.position);
            
            // Add to scene
            scene.add(trailParticle);
            
            // Store for fading - longer lifetime for faster balls
            trailParticle.userData = { 
                createdAt: Date.now(),
                lifetime: 250 * trailIntensity // Increased from 200 for longer trails
            };
            
            // Add to trail array
            ball.userData.trail.push(trailParticle);
        }
    }
    
    // Update existing trail particles
    for (let i = ball.userData.trail.length - 1; i >= 0; i--) {
        const particle = ball.userData.trail[i];
        const age = Date.now() - particle.userData.createdAt;
        const progress = age / particle.userData.lifetime;
        
        if (progress >= 1) {
            // Remove old particles
            scene.remove(particle);
            ball.userData.trail.splice(i, 1);
        } else {
            // Fade out
            particle.material.opacity = 0.5 * (1 - progress);
            
            // Shrink
            const scale = (1 - progress) * 0.8;
            particle.scale.set(scale, scale, scale);
        }
    }
    
    // Ensure we clean up any trail particles that might still exist
    // Force removal of particles older than 3 seconds regardless of their lifetime
    const now = Date.now();
    for (let i = ball.userData.trail.length - 1; i >= 0; i--) {
        const particle = ball.userData.trail[i];
        if (now - particle.userData.createdAt > 3000) {
            scene.remove(particle);
            ball.userData.trail.splice(i, 1);
        }
    }
    
    // Apply squash effect based on speed
    if (ball.userData && ball.userData.mesh) {
        const squashFactor = 1 + (speed / MAX_SHOT_SPEED) * 0.3;
        
        // Determine direction of travel
        const direction = new THREE.Vector3().copy(ballVelocity).normalize();
        
        // Scale ball in the direction of travel (squash)
        const mesh = ball.userData.mesh;
        mesh.scale.set(1, 1, 1); // Reset scale
        
        // Only apply squash at higher speeds
        if (speed > BALL_SPEED * 3) {
            // Find the dominant direction
            const absX = Math.abs(direction.x);
            const absY = Math.abs(direction.y);
            const absZ = Math.abs(direction.z);
            
            if (absX > absY && absX > absZ) {
                // X is dominant - squash in X direction
                mesh.scale.x = squashFactor;
                mesh.scale.y = 1 / Math.sqrt(squashFactor);
                mesh.scale.z = 1 / Math.sqrt(squashFactor);
            } else if (absY > absX && absY > absZ) {
                // Y is dominant - squash in Y direction
                mesh.scale.y = squashFactor;
                mesh.scale.x = 1 / Math.sqrt(squashFactor);
                mesh.scale.z = 1 / Math.sqrt(squashFactor);
            } else {
                // Z is dominant - squash in Z direction
                mesh.scale.z = squashFactor;
                mesh.scale.x = 1 / Math.sqrt(squashFactor);
                mesh.scale.y = 1 / Math.sqrt(squashFactor);
            }
        }
    }
}

// Update wall appearance based on damage
function updateWallAppearance() {
    // Check each object in the scene
    scene.children.forEach(child => {
        // Only process back walls
        if (child.userData && child.userData.isBackWall) {
            // Get current wall health
            let wallHealth = child.userData.isPlayerSide ? playerWallHealth : enemyWallHealth;
            
            // Calculate damage percentage
            const healthPercent = wallHealth / WALL_MAX_HP;
            
            // Update wall color based on health
            if (child.material) {
                // Interpolate between damage color (red) and normal color (blue)
                const r = Math.min(1, (1 - healthPercent) * 2); // More red as health decreases
                const g = 0.45 * healthPercent; // Some green component
                const b = healthPercent; // Full blue when healthy, none when damaged
                
                child.material.color.setRGB(r, g, b);
                
                // Update opacity - becomes more see-through as it's damaged
                child.material.opacity = 0.1 + healthPercent * 0.7;
            }
        }
    });
}

// Update wall transparency based on camera distance
function updateWallTransparency() {
    // Check each object in the scene
    scene.children.forEach(child => {
        // Only process back walls
        if (child.userData && child.userData.isBackWall) {
            // Check if this is the player's back wall
            if (child.userData.isPlayerSide) {
                // Always make player's wall completely transparent
                child.material.opacity = 0;
                child.material.depthWrite = false;
                return;
            }
            
            // For enemy wall, continue with distance-based transparency
            const distanceToCamera = camera.position.distanceTo(child.position);
            
            // Calculate opacity based on distance
            // Fully transparent when camera is very close, opaque when far
            const minDistance = 60; // Distance at which wall becomes transparent (increased from 50)
            const maxDistance = 120; // Distance at which wall is fully opaque (decreased from 150)
            
            if (distanceToCamera < minDistance) {
                // Almost fully transparent when very close
                child.material.opacity = 0.05; // Even more transparent (was 0.1)
            } else if (distanceToCamera > maxDistance) {
                // Fully opaque when far away
                child.material.opacity = 1.0;
            } else {
                // Linearly interpolate opacity based on distance
                const ratio = (distanceToCamera - minDistance) / (maxDistance - minDistance);
                child.material.opacity = 0.05 + ratio * 0.95; // Scale from 0.05 to 1.0
            }
            
            // Make sure all walls have depthWrite turned off when transparent
            child.material.depthWrite = child.material.opacity >= 0.95;
        }
    });
}

// Create visual effect for wall hits
function createWallHitEffect(position, damage) {
    // Create particles at hit position
    const particleCount = 10;
    const particles = new THREE.Group();
    
    // Create particle geometry
    const particleGeometry = new THREE.BoxGeometry(2, 2, 2);
    
    // Create particle material - use wall color with slight variation
    const particleMaterial = new THREE.MeshPhongMaterial({
        color: WALL_COLOR,
        transparent: true,
        opacity: 0.9
    });
    
    // Create particles with random velocities
    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial.clone());
        
        // Position particles at hit position with small random offsets
        particle.position.set(
            position.x + (Math.random() - 0.5) * 2,
            position.y + (Math.random() - 0.5) * 2,
            position.z + (Math.random() - 0.5) * 0.5
        );
        
        // Generate random velocity for particle
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5 + 0.2, // Slight upward bias
            (Math.random() - 0.5) * 0.5
        );
        
        // Add stronger impulse away from wall
        velocity.z += (Math.random() * 0.3);
        
        // Store velocity with particle
        particle.userData = {
            velocity: velocity,
            rotation: new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize().multiplyScalar(0.1)
        };
        
        particles.add(particle);
    }
    
    // Add particles to scene
    scene.add(particles);
    
    // Add a small flash at hit position based on damage
    const flashSize = Math.min(5 + damage * 0.2, 15); // Size scales with damage
    const flashGeometry = new THREE.SphereGeometry(flashSize, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7
    });
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(position);
    scene.add(flash);
    
    // Animate particles
    const startTime = Date.now();
    const duration = 500; // 0.5 seconds animation
    
    function animateParticles() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress < 1.0) {
            // Update each particle
            particles.children.forEach(particle => {
                // Move according to velocity
                particle.position.add(particle.userData.velocity);
                
                // Add gravity
                particle.userData.velocity.y -= 0.01;
                
                // Add rotation
                particle.rotation.x += particle.userData.rotation.x;
                particle.rotation.y += particle.userData.rotation.y;
                particle.rotation.z += particle.userData.rotation.z;
                
                // Fade out
                if (progress > 0.5) {
                    const fadeProgress = (progress - 0.5) / 0.5;
                    particle.material.opacity = 0.9 * (1 - fadeProgress);
                }
            });
            
            // Fade out flash
            flash.scale.multiplyScalar(0.95);
            flash.material.opacity = 0.7 * (1 - progress);
            
            requestAnimationFrame(animateParticles);
        } else {
            // Remove particles and flash when animation is complete
            scene.remove(particles);
            scene.remove(flash);
        }
    }
    
    // Start animation
    animateParticles();
}

// Player wins (enemy wall destroyed)
function handlePlayerWin() {
    gameRunning = false;
    
    // Show win message
    const winMessage = document.createElement('div');
    winMessage.id = 'game-over-message';
    winMessage.style.position = 'absolute';
    winMessage.style.top = '50%';
    winMessage.style.left = '50%';
    winMessage.style.transform = 'translate(-50%, -50%)';
    winMessage.style.color = '#2ecc71';
    winMessage.style.fontSize = '48px';
    winMessage.style.fontWeight = 'bold';
    winMessage.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
    winMessage.style.backgroundColor = 'rgba(0,0,0,0.7)';
    winMessage.style.padding = '20px 30px';
    winMessage.style.borderRadius = '10px';
    winMessage.style.zIndex = '200';
    winMessage.innerHTML = 'YOU WIN!<br><span style="font-size: 24px">You destroyed the enemy wall!</span><br><button id="restart-button" style="font-size: 24px; padding: 10px 20px; margin-top: 20px; cursor: pointer;">Play Again</button>';
    
    document.getElementById('game-container').appendChild(winMessage);
    
    // Play victory sound
    // ... (sound code)
    
    // Add restart button event listener
    document.getElementById('restart-button').addEventListener('click', restartGame);
}

// Enemy wins (player wall destroyed)
function handleEnemyWin() {
    gameRunning = false;
    
    // Show loss message
    const lossMessage = document.createElement('div');
    lossMessage.id = 'game-over-message';
    lossMessage.style.position = 'absolute';
    lossMessage.style.top = '50%';
    lossMessage.style.left = '50%';
    lossMessage.style.transform = 'translate(-50%, -50%)';
    lossMessage.style.color = '#e74c3c';
    lossMessage.style.fontSize = '48px';
    lossMessage.style.fontWeight = 'bold';
    lossMessage.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
    lossMessage.style.backgroundColor = 'rgba(0,0,0,0.7)';
    lossMessage.style.padding = '20px 30px';
    lossMessage.style.borderRadius = '10px';
    lossMessage.style.zIndex = '200';
    lossMessage.innerHTML = 'MATCH OVER<br><span style="font-size: 24px">The enemy broke through your final defense!</span><br><button id="restart-button" style="font-size: 24px; padding: 10px 20px; margin-top: 20px; cursor: pointer;">Try Again</button>';
    
    document.getElementById('game-container').appendChild(lossMessage);
    
    // Play defeat sound
    // ... (sound code)
    
    // Add restart button event listener
    document.getElementById('restart-button').addEventListener('click', restartGame);
}

// Restart the full game, resetting all courts
function restartFullGame() {
    // Send restart request to the server
    socket.emit('restart_game');
    
    // Remove game over message if it exists
    const gameOverMessage = document.getElementById('game-over-message');
    if (gameOverMessage) {
        document.getElementById('game-container').removeChild(gameOverMessage);
    }
    
    // The rest of the function will execute when server confirms restart
    // and sends a game_reset event, which already has a handler
    
    // Note: The server is now responsible for the game reset
    // The client will update based on the game_reset event from server
}

// Update UI to show current court
function updateCurrentCourtDisplay() {
    // Find or create court display element
    let courtDisplay = document.getElementById('court-display');
    if (!courtDisplay) {
        courtDisplay = document.createElement('div');
        courtDisplay.id = 'court-display';
        courtDisplay.style.position = 'absolute';
        courtDisplay.style.top = '20px';
        courtDisplay.style.left = '50%';
        courtDisplay.style.transform = 'translateX(-50%)';
        courtDisplay.style.color = 'white';
        courtDisplay.style.fontSize = '18px';
        courtDisplay.style.zIndex = '100';
        courtDisplay.style.textShadow = '1px 1px 2px rgba(0,0,0,0.7)';
        courtDisplay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        courtDisplay.style.padding = '5px 10px';
        courtDisplay.style.borderRadius = '5px';
        document.getElementById('game-container').appendChild(courtDisplay);
    }
    
    // Get a user-friendly court name
    let courtName = "COURT " + (currentCourtIndex + 1);
    
    // Add descriptions based on position
    if (currentCourtIndex === 0) {
        courtName += " (PLAYER 2 FINAL DEFENSE)";
    } else if (currentCourtIndex === totalCourts - 1) {
        courtName += " (PLAYER 1 FINAL DEFENSE)";
    } else if (currentCourtIndex === Math.floor(totalCourts / 2)) {
        courtName += " (CENTER)";
    }
    
    // Create a visual indicator of match progress (linear track through courts)
    // FIXED: Calculate progress as percentage through courts (inverted from original)
    let progressValue = ((totalCourts - 1 - currentCourtIndex) / (totalCourts - 1)) * 100;
    
    // Adjust progress based on wall health in current court
    if (myPlayerNumber === 1) {
        // For Player 1, progressing means breaking Player 2's walls (move to higher courts)
        if (currentCourtIndex < totalCourts - 1) {
            // Add progress based on damage to enemy wall in current court
            const damagePercent = (WALL_MAX_HP - enemyWallHealth) / WALL_MAX_HP;
            const remainingProgress = ((totalCourts - 1 - currentCourtIndex) / (totalCourts - 1)) * 100;
            progressValue = ((totalCourts - 1 - currentCourtIndex - 1) / (totalCourts - 1)) * 100;
            progressValue += damagePercent * (100 / (totalCourts - 1));
        }
    } else {
        // For Player 2, progressing means breaking Player 1's walls (move to lower courts)
        if (currentCourtIndex > 0) {
            // Add progress based on damage to enemy wall in current court 
            const damagePercent = (WALL_MAX_HP - enemyWallHealth) / WALL_MAX_HP;
            const courtProgress = currentCourtIndex / (totalCourts - 1);
            progressValue = (1 - courtProgress) * 100;
            progressValue += damagePercent * (100 / (totalCourts - 1));
        }
    }
    
    progressValue = Math.min(progressValue, 100); // Cap at 100%
    
    // Show whose court we're on
    let courtOwner = "";
    if (currentCourtIndex === 0) {
        courtOwner = "Player 2's Territory";
    } else if (currentCourtIndex === totalCourts - 1) {
        courtOwner = "Player 1's Territory";
    } else {
        courtOwner = "Neutral Court";
    }
    
    // Create a visual representation of court transition status
    const matchProgress = `
        <div style="width: 100%; height: 15px; background-color: #555; margin-top: 5px; border-radius: 10px; overflow: hidden;">
            <div style="height: 100%; width: ${progressValue}%; background-color: #2ecc71; transition: width 0.5s ease-in-out;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 2px;">
            <div>START</div>
            <div>VICTORY</div>
        </div>
    `;
    
    // Show current court and progression 
    courtDisplay.innerHTML = `
        <div style="text-align: center; font-weight: bold;">${courtName}</div>
        <div style="text-align: center; margin-bottom: 5px;">${courtOwner}</div>
        <div style="text-align: center; margin-bottom: 5px;">Progress to Victory</div>
        ${matchProgress}
    `;
    
    // Flash the court display when transitioning
    if (isTransitioning) {
        flashElement(courtDisplay, 'rgba(52, 152, 219, 0.5)');
    }
}

// Player wins a wall break (renamed to avoid conflict with the playerWins variable)
function playerWallVictory() {
    gameRunning = false;
    
    // Show win message
    const winMessage = document.createElement('div');
    winMessage.id = 'game-over-message';
    winMessage.style.position = 'absolute';
    winMessage.style.top = '50%';
    winMessage.style.left = '50%';
    winMessage.style.transform = 'translate(-50%, -50%)';
    winMessage.style.color = '#2ecc71';
    winMessage.style.fontSize = '48px';
    winMessage.style.fontWeight = 'bold';
    winMessage.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
    winMessage.style.backgroundColor = 'rgba(0,0,0,0.7)';
    winMessage.style.padding = '20px 30px';
    winMessage.style.borderRadius = '10px';
    winMessage.style.zIndex = '200';
    winMessage.innerHTML = 'YOU WIN!<br><span style="font-size: 24px">You destroyed the enemy wall!</span><br><button id="restart-button" style="font-size: 24px; padding: 10px 20px; margin-top: 20px; cursor: pointer;">Play Again</button>';
    
    document.getElementById('game-container').appendChild(winMessage);
    
    // Add restart button event listener
    document.getElementById('restart-button').addEventListener('click', restartFullGame);
}

// Enemy wins a wall break (renamed to avoid conflict with enemyWins variable)
function enemyWallVictory() {
    gameRunning = false;
    
    // Show loss message
    const lossMessage = document.createElement('div');
    lossMessage.id = 'game-over-message';
    lossMessage.style.position = 'absolute';
    lossMessage.style.top = '50%';
    lossMessage.style.left = '50%';
    lossMessage.style.transform = 'translate(-50%, -50%)';
    lossMessage.style.color = '#e74c3c';
    lossMessage.style.fontSize = '48px';
    lossMessage.style.fontWeight = 'bold';
    lossMessage.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
    lossMessage.style.backgroundColor = 'rgba(0,0,0,0.7)';
    lossMessage.style.padding = '20px 30px';
    lossMessage.style.borderRadius = '10px';
    lossMessage.style.zIndex = '200';
    lossMessage.innerHTML = 'GAME OVER<br><span style="font-size: 24px">Your wall was destroyed!</span><br><button id="restart-button" style="font-size: 24px; padding: 10px 20px; margin-top: 20px; cursor: pointer;">Try Again</button>';
    
    document.getElementById('game-container').appendChild(lossMessage);
    
    // Add restart button event listener
    document.getElementById('restart-button').addEventListener('click', restartFullGame);
}

// Start the game when DOM is loaded
window.addEventListener('DOMContentLoaded', init); 

// Update player position display
function updatePositionDisplay() {
    const display = document.getElementById('position-display');
    // Ensure player exists before accessing position
    if (display && player && player.position) {
        const px = player.position.x.toFixed(2);
        const py = player.position.y.toFixed(2);
        const pz = player.position.z.toFixed(2);

        let opponentText = "Opponent: (Waiting...)";
        // Find the first opponent in the opponents map (assuming 1v1)
        const opponentIds = Object.keys(opponents);
        if (opponentIds.length > 0 && opponents[opponentIds[0]] && opponents[opponentIds[0]].position) {
            const opp = opponents[opponentIds[0]];
            const ox = opp.position.x.toFixed(2);
            const oy = opp.position.y.toFixed(2);
            const oz = opp.position.z.toFixed(2);
            opponentText = `Opponent: X: ${ox} | Y: ${oy} | Z: ${oz}`;
        }


        // Court display needs server-side state (currentCourtIndex)
        // const middleCourtIndex = Math.floor(totalCourts / 2);
        // const currentZOffset = (currentCourtIndex - middleCourtIndex) * COURT_LENGTH;
        // const courtMinZ = -currentZOffset - COURT_LENGTH/2;
        // const courtMaxZ = -currentZOffset + COURT_LENGTH/2;
        // let courtText = `Court: ${currentCourtIndex+1}/${totalCourts} (Z: ${courtMinZ.toFixed(2)} to ${courtMaxZ.toFixed(2)})`;
        let courtText = "Court: (Syncing...)"; // Placeholder

        display.innerHTML = 
            `<div>Player ${myPlayerNumber || ''}: X: ${px} | Y: ${py} | Z: ${pz}</div>
             <div>${opponentText}</div>
             <div>${courtText}</div>`;
    }
}

// NEW: Function to reset local game state based on server data
function resetLocalGame(newState) {
     console.log("Resetting local game elements based on server state:", newState);
     // Reset ball position/velocity & other state via central function
     processGameStateUpdate(newState); // Update ball, walls, etc. from server state

     // Reset local player position
     if (player && myPlayerNumber) {
        const initialZ = (myPlayerNumber === 1) ? -COURT_LENGTH / 2 + PLAYER_SIZE * 3 : COURT_LENGTH / 2 - PLAYER_SIZE * 3;
        player.position.set(0, PLAYER_SIZE * 2, initialZ);
        playerVelocity.set(0,0,0);
     }

     // Reset UI elements (if needed)
     score = 0;
     playerWins = 0; // Reset local win counters
     enemyWins = 0;
     consecutiveHits = 0;
     updateComboDisplay();

     // Make walls visible again and reset appearance (health update handles color)
     scene.traverse(child => {
        if (child.userData && child.userData.isBackWall) {
            child.visible = true;
            // Explicitly reset material here before updateWallAppearance runs with new health
            if (child.material) {
                 child.material.color.set(WALL_COLOR);
                 child.material.opacity = 0.8; // Reset to default opacity
                 child.material.needsUpdate = true;
            }
        }
    });

     // Remove any existing wall break particle effects
    wallBreakParticles.forEach(particles => scene.remove(particles));
    wallBreakParticles = [];

    // Ensure game is running
    gameRunning = true;
    gamePaused = false;
    const pauseMenu = document.getElementById('pause-menu');
    if(pauseMenu) pauseMenu.style.display = 'none';
    // Remove game over message if present
     const gameOverMessage = document.getElementById('game-over-message');
     if (gameOverMessage) gameOverMessage.remove();

     // Re-enable controls?
}

// NEW: Central function to process game state updates
function processGameStateUpdate(newState) {
    // Update Ball
    if (ball && newState.ball) {
        ball.position.set(newState.ball.position.x, newState.ball.position.y, newState.ball.position.z);
        ballVelocity.set(newState.ball.velocity.x, newState.ball.velocity.y, newState.ball.velocity.z);
    }

    // Update Opponents
    for (const id in newState.players) {
        if (id !== myPlayerId && opponents[id]) {
            const opponentState = newState.players[id];
            opponents[id].position.set(opponentState.position.x, opponentState.position.y, opponentState.position.z);
            if (opponents[id].userData) {
                opponents[id].userData.velocity.set(opponentState.velocity.x, opponentState.velocity.y, opponentState.velocity.z);
            }
        }
    }

    // Update Wall Health (for UI)
    if (newState.walls) {
        // Determine which wall is player's and which is enemy's
        const myWallKey = `player${myPlayerNumber}`;
        const enemyWallKey = `player${myPlayerNumber === 1 ? 2 : 1}`;

        playerWallHealth = newState.walls[myWallKey] !== undefined ? newState.walls[myWallKey] : WALL_MAX_HP;
        enemyWallHealth = newState.walls[enemyWallKey] !== undefined ? newState.walls[enemyWallKey] : WALL_MAX_HP;

        // Update UI elements if they exist
        if(playerHealthEl) playerHealthEl.textContent = playerWallHealth;
        if(enemyHealthEl) enemyHealthEl.textContent = enemyWallHealth;

        // Update visual appearance of wall meshes
        updateWallAppearance();
    }

    // Update scores
    if (newState.scores) {
        const myPlayer = `player${myPlayerNumber}`;
        const opponentPlayer = `player${myPlayerNumber === 1 ? 2 : 1}`;
        
        // Update score display
        const scoreValueEl = document.getElementById('score-value');
        if(scoreValueEl) scoreValueEl.textContent = newState.scores[myPlayer];
        
        // Update opponent score display (if it exists)
        const opponentScoreEl = document.getElementById('opponent-score-value');
        if(opponentScoreEl) opponentScoreEl.textContent = newState.scores[opponentPlayer];
        else if (newState.scores[opponentPlayer] > 0) {
            // Create the opponent score display if it doesn't exist and opponent has scored
            createOpponentScoreDisplay(newState.scores[opponentPlayer]);
        }
    }
    
    // Update current court index and wins
    if (newState.currentCourtIndex !== undefined) {
        const prevCourtIndex = currentCourtIndex;
        currentCourtIndex = newState.currentCourtIndex;
        
        // Update UI for court index and wins
        updateCurrentCourtDisplay();
        
        // Handle court transition
        if (prevCourtIndex !== currentCourtIndex) {
            isTransitioning = true;
            // Add visual transition effect here (e.g., camera zoom-out/zoom-in)
        }
    }
    
    if (newState.player1Wins !== undefined) playerWins = newState.player1Wins;
    if (newState.player2Wins !== undefined) enemyWins = newState.player2Wins;
    
    // Update UI for wins
    const playerWinsEl = document.getElementById('player-wins');
    const enemyWinsEl = document.getElementById('enemy-wins');
    if(playerWinsEl) playerWinsEl.textContent = playerWins;
    if(enemyWinsEl) enemyWinsEl.textContent = enemyWins;
}

// NEW: Function to create opponent score display if not already exists
function createOpponentScoreDisplay(initialScore) {
    // Check if we already have the opponent score element
    if (document.getElementById('opponent-score-value')) return;
    
    // Get the score container or create one
    let scoreContainer = document.getElementById('score-container');
    if (!scoreContainer) {
        // If no score container exists, create a new one
        scoreContainer = document.createElement('div');
        scoreContainer.id = 'score-container';
        scoreContainer.style.position = 'absolute';
        scoreContainer.style.top = '10px';
        scoreContainer.style.left = '10px';
        scoreContainer.style.display = 'flex';
        scoreContainer.style.flexDirection = 'column';
        scoreContainer.style.gap = '5px';
        document.getElementById('game-container').appendChild(scoreContainer);
    }
    
    // Add opponent score to the container
    const opponentScoreDisplay = document.createElement('div');
    opponentScoreDisplay.className = 'score-display';
    opponentScoreDisplay.innerHTML = `<span>Opponent: <span id="opponent-score-value">${initialScore}</span></span>`;
    opponentScoreDisplay.style.color = 'white';
    opponentScoreDisplay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    opponentScoreDisplay.style.padding = '5px 10px';
    opponentScoreDisplay.style.borderRadius = '5px';
    scoreContainer.appendChild(opponentScoreDisplay);
}

// NEW: Function to display game over message based on win/loss
function showGameOver(iWon, scores) {
    gameRunning = false;
    
    // Create or reuse game over container
    let gameOverMsg = document.getElementById('game-over-message');
    if (!gameOverMsg) {
        gameOverMsg = document.createElement('div');
        gameOverMsg.id = 'game-over-message';
        gameOverMsg.style.position = 'absolute';
        gameOverMsg.style.top = '50%';
        gameOverMsg.style.left = '50%';
        gameOverMsg.style.transform = 'translate(-50%, -50%)';
        gameOverMsg.style.fontSize = '48px';
        gameOverMsg.style.fontWeight = 'bold';
        gameOverMsg.style.textShadow = '2px 2px 4px rgba(0,0,0,0.7)';
        gameOverMsg.style.backgroundColor = 'rgba(0,0,0,0.7)';
        gameOverMsg.style.padding = '20px 30px';
        gameOverMsg.style.borderRadius = '10px';
        gameOverMsg.style.zIndex = '200';
        gameOverMsg.style.textAlign = 'center';
        document.getElementById('game-container').appendChild(gameOverMsg);
    }
    
    // Set content based on win/loss
    if (iWon) {
        gameOverMsg.style.color = '#2ecc71'; // Green for win
        gameOverMsg.innerHTML = 'VICTORY!<br><span style="font-size: 24px">You broke through all walls!</span>';
        // Play victory sound if available
        flashScreen('rgba(46, 204, 113, 0.5)'); // More intense green flash for victory
    } else {
        gameOverMsg.style.color = '#e74c3c'; // Red for loss
        gameOverMsg.innerHTML = 'DEFEAT<br><span style="font-size: 24px">Your walls were breached!</span>';
        // Play defeat sound if available
        flashScreen('rgba(231, 76, 60, 0.5)'); // More intense red flash for defeat
    }
    
    // Add score info
    const myPlayer = `player${myPlayerNumber}`;
    const opponentPlayer = `player${myPlayerNumber === 1 ? 2 : 1}`;
    const scoreInfo = document.createElement('div');
    scoreInfo.style.fontSize = '20px';
    scoreInfo.style.marginTop = '15px';
    scoreInfo.innerHTML = `Final Score: ${scores[myPlayer]} - ${scores[opponentPlayer]}`;
    gameOverMsg.appendChild(scoreInfo);
    
    // Add message about manual restart
    const restartInfo = document.createElement('div');
    restartInfo.style.fontSize = '16px';
    restartInfo.style.marginTop = '15px';
    restartInfo.innerHTML = 'Click "Play Again" to start a new game.';
    gameOverMsg.appendChild(restartInfo);
}

// NEW: Flash an element with a color to highlight changes
function flashElement(element, color) {
    if (!element) return;
    
    const originalBackground = element.style.backgroundColor;
    element.style.backgroundColor = color;
    element.style.transition = 'background-color 1s';
    
    setTimeout(() => {
        element.style.backgroundColor = originalBackground;
    }, 500);
}