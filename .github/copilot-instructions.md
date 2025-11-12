# SAE Star Atlas Explorer - Copilot Instructions

This project is a web-based explorer for Star Atlas wallet sage fees and blockchain interactions.

## Project Overview
- **Name**: SAE Star Atlas Explorer  
- **Purpose**: Explore and display Star Atlas wallet sage fees
- **Tech Stack**: TypeScript, Node.js, Express.js, Star Atlas SDK
- **Architecture**: Web server with REST API and frontend interface

## Development Guidelines
- Use TypeScript for all source code
- Follow Star Atlas SDK patterns for blockchain interactions
- Implement proper error handling for Solana/blockchain operations
- Use modular architecture with separate routes for different features
- Include comprehensive logging for debugging blockchain interactions

## Key Features to Implement
- Wallet connection and authentication
- Sage fee calculation and display
- Transaction history viewing
- Real-time blockchain data updates
- User-friendly web interface

## Dependencies
- @staratlas/sage - Star Atlas game SDK
- @solana/web3.js - Solana blockchain interaction
- @project-serum/anchor - Solana program framework
- express - Web server framework
- typescript - Type safety and development

## File Structure
- `src/` - Source code
- `public/` - Static web assets  
- `examples/` - Usage examples and demos
- `dist/` - Compiled JavaScript output