/**
 * SERVIDOR SIMPLIFICADO PARA TESTING
 * 
 * Esta versión NO requiere registro previo.
 * Simplemente envía la wallet y recibe ARY.
 * Perfecto para pruebas rápidas.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
const PORT = 3001; // Puerto diferente para no interferir con el servidor principal

app.use(cors());
app.use(express.json());

// Configuración
const CONTRACT_ADDRESS = "0x3efbce682b32f495b4912f3866ce69da1a2d7e5c";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const BUSINESS_PRIVATE_KEY = process.env.BUSINESS_PRIVATE_KEY;
const REWARD_AMOUNT = "5";

// Validar
if (!SEPOLIA_RPC_URL || !BUSINESS_PRIVATE_KEY) {
  console.error('❌ Configura SEPOLIA_RPC_URL y BUSINESS_PRIVATE_KEY en .env');
  process.exit(1);
}

// ABI
const ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// Conectar
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const businessWallet = new ethers.Wallet(BUSINESS_PRIVATE_KEY, provider);
const tokenContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, businessWallet);

// Contador simple
let transactionCount = 0;

// ========================================
// ENDPOINT ÚNICO: ENVIAR RECOMPENSA
// ========================================

app.post('/api/quick-reward', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    // Validar
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Dirección de wallet inválida' 
      });
    }

    console.log(`\n💰 Enviando recompensa #${transactionCount + 1}`);
    console.log(`   Destinatario: ${walletAddress}`);

    // Obtener info del token
    const [decimals, symbol] = await Promise.all([
      tokenContract.decimals(),
      tokenContract.symbol()
    ]);

    const rewardInWei = ethers.parseUnits(REWARD_AMOUNT, decimals);

    // Enviar
    const tx = await tokenContract.transfer(walletAddress, rewardInWei);
    console.log(`📤 TX enviada: ${tx.hash}`);

    // Esperar
    const receipt = await tx.wait();
    console.log(`✅ Confirmada en bloque ${receipt.blockNumber}\n`);

    transactionCount++;

    // Responder
    res.json({
      success: true,
      message: `¡${REWARD_AMOUNT} ${symbol} enviados exitosamente!`,
      details: {
        recipient: walletAddress,
        amount: `${REWARD_AMOUNT} ${symbol}`,
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        explorerUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`,
        transactionNumber: transactionCount
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    let errorMsg = error.message;
    if (error.message.includes('insufficient funds')) {
      errorMsg = 'Sin suficiente ETH para gas';
    } else if (error.message.includes('transfer amount exceeds balance')) {
      errorMsg = 'Sin suficientes ARY tokens';
    }

    res.status(500).json({ 
      success: false, 
      error: errorMsg 
    });
  }
});

// Balance
app.get('/api/status', async (req, res) => {
  try {
    const [aryBalance, ethBalance, decimals, symbol] = await Promise.all([
      tokenContract.balanceOf(businessWallet.address),
      provider.getBalance(businessWallet.address),
      tokenContract.decimals(),
      tokenContract.symbol()
    ]);

    res.json({
      success: true,
      wallet: businessWallet.address,
      balances: {
        ary: ethers.formatUnits(aryBalance, decimals) + ' ' + symbol,
        eth: ethers.formatEther(ethBalance) + ' ETH'
      },
      totalTransactions: transactionCount,
      rewardAmount: REWARD_AMOUNT + ' ' + symbol
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Iniciar
app.listen(PORT, async () => {
  console.log('\n' + '='.repeat(50));
  console.log('⚡ SERVIDOR QUICK REWARD (TESTING)');
  console.log('='.repeat(50));
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Wallet: ${businessWallet.address}`);
  console.log(`Recompensa: ${REWARD_AMOUNT} ARY`);
  
  try {
    const status = await fetch(`http://localhost:${PORT}/api/status`).then(r => r.json());
    console.log(`Balance ARY: ${status.balances.ary}`);
    console.log(`Balance ETH: ${status.balances.eth}`);
  } catch (e) {}
  
  console.log('\n💡 Endpoint: POST /api/quick-reward');
  console.log('   Body: { "walletAddress": "0x..." }');
  console.log('='.repeat(50) + '\n');
});
