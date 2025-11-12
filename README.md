# SAE Star Atlas Explorer

A web-based explorer for Star Atlas wallet sage fees and blockchain interactions.

## 🚀 Features

- **Wallet Analysis**: Analyze Solana wallets and their Star Atlas holdings
- **SAGE Fees**: Calculate and track SAGE fees for various activities
- **Real-time Data**: Access live blockchain data and transaction history
- **REST API**: Comprehensive API for developers
- **Modern Interface**: Clean, responsive web interface

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, TypeScript
- **Blockchain**: Solana Web3.js, Star Atlas SDK
- **Frontend**: HTML5, CSS3, JavaScript (vanilla)
- **Development**: tsx for development, TypeScript compilation

## 📦 Dependencies

### Core Dependencies
- `@staratlas/sage` - Star Atlas game SDK
- `@solana/web3.js` - Solana blockchain interaction
- `@project-serum/anchor` - Solana program framework
- `express` - Web server framework
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management

### Development Dependencies
- `typescript` - Type safety and development
- `tsx` - TypeScript execution for development
- `@types/express` - Express TypeScript definitions
- `eslint` - Code linting

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd SA\ Explorer
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` file with your configuration.

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Open in browser**:
   Navigate to `http://localhost:3000`

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run clean` - Clean build directory

## 📚 API Endpoints

### Wallet Endpoints
- `GET /api/wallet/balance/:address` - Get wallet SOL balance
- `GET /api/wallet/tokens/:address` - Get wallet token accounts

### SAGE Endpoints  
- `GET /api/sage/game` - Get SAGE game information
- `GET /api/sage/profile/:address` - Get player profile
- `GET /api/sage/fleets/:address` - Get fleets information

### Fees Endpoints
- `GET /api/fees/wallet/:address` - Calculate SAGE fees for wallet
- `GET /api/fees/history/:address` - Get fee history
- `GET /api/fees/rates` - Get current fee rates

### Utility Endpoints
- `GET /health` - Server health check

## 📁 Project Structure

```
SAE Star Atlas Explorer/
├── .github/
│   └── copilot-instructions.md
├── public/
│   └── index.html
├── src/
│   ├── index.ts
│   └── routes/
│       ├── wallet.ts
│       ├── sage.ts
│       └── fees.ts
├── dist/              # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## 🔧 Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PORT=3000
SAGE_PROGRAM_ID=SAGEaQ6yoNaWH1EAqiANWMdKZgLYVo1yMJ1z7JGRRFr
ATLAS_MINT=ATLASXmbPQxBUYbVuYw6ppwNZ6dn5JKLQEXGXY94DFZ
POLIS_MINT=poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk
NODE_ENV=development
```

## 🧪 Development

### Running in Development Mode

```bash
npm run dev
```

The server will start with hot reload enabled. Any changes to TypeScript files will automatically restart the server.

### Building for Production

```bash
npm run build
npm start
```

### Code Style

The project uses ESLint for code linting. Run:

```bash
npm run lint
```

## 🗂️ Version Control & Backup Strategy

### Git Workflow
- **main/master branch**: Production-ready code
- **develop branch**: Integration branch for features
- **feature branches**: Individual feature development

### Backup Recommendations
1. **Remote Repository**: Push to GitHub/GitLab regularly
2. **Local Backups**: Regular commits with descriptive messages
3. **Environment Backup**: Keep `.env.example` updated
4. **Database Backup**: If using persistent storage, backup regularly

### Git Best Practices
```bash
# Regular commits
git add .
git commit -m "feat: add wallet balance endpoint"

# Push to remote
git push origin main

# Create feature branches
git checkout -b feature/sage-fees-calculation
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Star Atlas team for the awesome SDK
- Solana Foundation for the blockchain infrastructure
- Community contributors and testers

---

**SAE Star Atlas Explorer** - Built with ❤️ for the Star Atlas community