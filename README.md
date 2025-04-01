# 3D Air Hockey - Vibe Jam 2025 Entry

Real-time multiplayer air hockey game with 3D physics and multiple courts.

## Deployment on Render

This game is deployed on Render.com for free hosting with WebSocket support.

### Deployment Steps

1. Created a Render account at [render.com](https://render.com/)
2. Connected GitHub repository
3. Created a Web Service with the following settings:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start` (runs `node server.js`)
   - Environment Variables: None required

## Game Rules

- Players compete across multiple courts
- Break opponent's walls by hitting them with the ball
- Win by breaking enough walls to reach your opponent's final court
- Use arrow keys or WASD to move
- Space to charge and release for power shots

## Technical Details

- Built with Node.js, Express, and Socket.io for real-time communication
- 3D rendering with Three.js
- Physics simulation on both client and server

## Vibe Jam 2025 Entry

This game was created for the Vibe Jam 2025 game jam, with at least 80% of the code written by AI.

## Controls

### Desktop:
- W/Up Arrow: Move Up
- S/Down Arrow: Move Down
- A/Left Arrow: Move Left
- D/Right Arrow: Move Right
- R: Move Backward (away from your wall)
- F: Move Forward (toward opponent's wall)
- Space: Punch the ball
- Shift: Hold to charge a more powerful punch
- Space: Restart game (when game over)

### Mobile:
- Left joystick: Move Up/Down/Left/Right
- Right joystick: Move Forward/Backward
- Tap punch button to hit the ball
- Hold punch button to charge a more powerful shot
- Tap "Play Again" button to restart when game over

## How to Play

1. Control your flying character to hit the ball
2. Protect your wall from being hit by the ball
3. Try to hit the opponent's wall with the ball to damage it
4. The stronger your shots, the more damage they do to the wall (up to 100 health per wall)
5. Ball damage is calculated based on speed - faster hits cause more damage
6. Charge your punches by holding the punch button for more powerful shots
7. Break your opponent's wall to advance to the next court
8. The game has 3 courts in total - the middle court is where everyone starts
9. To win the game, you must break through all of your opponent's walls (2 walls total)
10. First player to win 2 rounds (break 2 walls) wins the whole match!

## Game Features

- Multi-court progression system
- Real-time wall damage display
- Dynamic wall physics - damaged walls have reduced bounce
- Visual damage feedback on walls
- Particle effects for wall hits and breaks
- Damage numbers showing impact strength
- Wall color changes based on remaining health
- Automatic court transitions after wall breaks
- Multiplayer support with Socket.io

## How to Host

### Local Testing

1. Clone this repository
2. Open the folder in your terminal
3. Install dependencies: `npm install`
4. Start the server: `node server.js`
5. Open your browser and go to `http://localhost:3000`

### Hosting Online

You can host this game on any Node.js-compatible hosting service:

- Heroku
- Glitch
- Replit
- Digital Ocean
- AWS Elastic Beanstalk
- Render

Simply push your code to your hosting provider, ensure the Node.js server starts properly, and the game will be available at your domain.

## Technologies Used

- Three.js - 3D rendering
- NippleJS - Mobile touch controls
- Node.js - Server backend
- Socket.io - Real-time multiplayer communication
- Express - Web server framework

## Performance Notes

The game is designed to load quickly and run smoothly on both desktop and mobile devices. It uses minimal assets to ensure fast loading times. 