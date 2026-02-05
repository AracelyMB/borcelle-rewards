// ========================================
// SERVIDOR BACKEND - SISTEMA DE RECOMPENSAS ARY
// Versión mejorada con variables de entorno
// ========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ========================================
// CONFIGURACIÓN DEL CONTRATO Y WALLET
// ========================================

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x3efbce682b32f495b4912f3866ce69da1a2d7e5c";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const BUSINESS_PRIVATE_KEY = process.env.BUSINESS_PRIVATE_KEY;
const REWARD_AMOUNT = process.env.REWARD_AMOUNT || "5";

// Validar configuración
if (!SEPOLIA_RPC_URL || !BUSINESS_PRIVATE_KEY) {
  console.error('❌ ERROR: Faltan variables de entorno');
  console.error('Por favor configura SEPOLIA_RPC_URL y BUSINESS_PRIVATE_KEY en el archivo .env');
  process.exit(1);
}

// ABI mínimo del contrato ERC-20
const ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// Conectar al proveedor de Sepolia
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const businessWallet = new ethers.Wallet(BUSINESS_PRIVATE_KEY, provider);
const tokenContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, businessWallet);

// ========================================
// BASE DE DATOS SIMULADA
// ========================================

const customers = new Map();
const transactions = []; // Historial de transacciones

// ========================================
// ENDPOINTS
// ========================================

// 1. Registrar wallet del cliente
app.post('/api/register-wallet', async (req, res) => {
  try {
    const { walletAddress, name, email } = req.body;

    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Dirección de wallet inválida' 
      });
    }

    const normalized = walletAddress.toLowerCase();
    
    if (customers.has(normalized)) {
      return res.status(409).json({ 
        success: false, 
        error: 'Esta wallet ya está registrada' 
      });
    }

    customers.set(normalized, {
      name: name || 'Cliente',
      email: email || '',
      purchaseCount: 0,
      totalRewards: 0,
      registeredAt: new Date().toISOString()
    });

    console.log(`✅ Nueva wallet registrada: ${walletAddress}`);

    res.json({
      success: true,
      message: 'Wallet registrada exitosamente',
      walletAddress
    });

  } catch (error) {
    console.error('Error registrando wallet:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 2. Enviar recompensa automáticamente
app.post('/api/send-reward', async (req, res) => {
  try {
    const { walletAddress, purchaseId, purchaseAmount } = req.body;

    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Dirección de wallet inválida' 
      });
    }

    const normalized = walletAddress.toLowerCase();

    if (!customers.has(normalized)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Wallet no registrada. Por favor registra tu wallet primero.' 
      });
    }

    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();
    const rewardInWei = ethers.parseUnits(REWARD_AMOUNT, decimals);

    console.log(`\n💰 Procesando recompensa:`);
    console.log(`   Cliente: ${walletAddress}`);
    console.log(`   Compra ID: ${purchaseId || 'N/A'}`);
    console.log(`   Recompensa: ${REWARD_AMOUNT} ${symbol}`);

    // Enviar la transacción (el negocio paga el gas)
    const tx = await tokenContract.transfer(walletAddress, rewardInWei);
    
    console.log(`📤 Transacción enviada: ${tx.hash}`);
    console.log(`⏳ Esperando confirmación...`);

    // Esperar confirmación
    const receipt = await tx.wait();

    console.log(`✅ Confirmada en bloque ${receipt.blockNumber}`);
    console.log(`⛽ Gas usado: ${receipt.gasUsed.toString()}\n`);

    // Actualizar datos del cliente
    const customer = customers.get(normalized);
    customer.purchaseCount += 1;
    customer.totalRewards += parseFloat(REWARD_AMOUNT);
    customer.lastPurchase = new Date().toISOString();

    // Guardar en historial
    const transaction = {
      id: transactions.length + 1,
      recipient: walletAddress,
      amount: REWARD_AMOUNT,
      symbol,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      purchaseId: purchaseId || null,
      purchaseAmount: purchaseAmount || null,
      timestamp: new Date().toISOString()
    };

    transactions.push(transaction);

    res.json({
      success: true,
      message: `¡Recompensa enviada exitosamente!`,
      reward: {
        amount: `${REWARD_AMOUNT} ${symbol}`,
        recipient: walletAddress,
        txHash: tx.hash,
        explorerUrl: `https://sepolia.etherscan.io/tx/${tx.hash}`
      },
      transaction,
      customerStats: {
        totalPurchases: customer.purchaseCount,
        totalRewards: `${customer.totalRewards} ${symbol}`
      }
    });

  } catch (error) {
    console.error('❌ Error enviando recompensa:', error);
    
    let errorMessage = error.message;
    
    if (error.message.includes('insufficient funds')) {
      errorMessage = 'La wallet del negocio no tiene suficiente ETH para pagar el gas';
    } else if (error.message.includes('transfer amount exceeds balance')) {
      errorMessage = 'La wallet del negocio no tiene suficientes ARY tokens';
    } else if (error.message.includes('nonce')) {
      errorMessage = 'Error de sincronización. Por favor intenta de nuevo.';
    }

    res.status(500).json({ 
      success: false, 
      error: errorMessage 
    });
  }
});

// 3. Consultar balance de la wallet del negocio
app.get('/api/business-balance', async (req, res) => {
  try {
    const [balance, decimals, symbol, ethBalance] = await Promise.all([
      tokenContract.balanceOf(businessWallet.address),
      tokenContract.decimals(),
      tokenContract.symbol(),
      provider.getBalance(businessWallet.address)
    ]);

    const balanceFormatted = ethers.formatUnits(balance, decimals);
    const ethFormatted = ethers.formatEther(ethBalance);

    res.json({
      success: true,
      businessWallet: businessWallet.address,
      balances: {
        ary: `${balanceFormatted} ${symbol}`,
        eth: `${ethFormatted} ETH`
      },
      totalCustomers: customers.size,
      totalTransactions: transactions.length
    });

  } catch (error) {
    console.error('Error consultando balance:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 4. Consultar datos de un cliente
app.get('/api/customer/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();

    if (!customers.has(walletAddress)) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cliente no encontrado' 
      });
    }

    const customer = customers.get(walletAddress);
    const customerTransactions = transactions.filter(
      tx => tx.recipient.toLowerCase() === walletAddress
    );

    res.json({
      success: true,
      customer: {
        walletAddress,
        ...customer
      },
      transactions: customerTransactions
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 5. Historial de transacciones
app.get('/api/transactions', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentTransactions = transactions.slice(-limit).reverse();
  
  res.json({
    success: true,
    total: transactions.length,
    transactions: recentTransactions
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    wallet: businessWallet.address 
  });
});

// ========================================
// INICIAR SERVIDOR
// ========================================

app.listen(PORT, async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 SERVIDOR DE RECOMPENSAS ARY INICIADO');
  console.log('='.repeat(60));
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📝 Wallet del negocio: ${businessWallet.address}`);
  console.log(`📄 Contrato ARY: ${CONTRACT_ADDRESS}`);
  console.log(`💰 Recompensa por compra: ${REWARD_AMOUNT} ARY`);
  
  try {
    const [balance, symbol, ethBalance] = await Promise.all([
      tokenContract.balanceOf(businessWallet.address),
      tokenContract.symbol(),
      provider.getBalance(businessWallet.address)
    ]);
    
    const decimals = await tokenContract.decimals();
    const balanceFormatted = ethers.formatUnits(balance, decimals);
    const ethFormatted = ethers.formatEther(ethBalance);
    
    console.log(`💎 Balance ARY: ${balanceFormatted} ${symbol}`);
    console.log(`⛽ Balance ETH: ${ethFormatted} ETH`);
  } catch (error) {
    console.log(`⚠️  No se pudo verificar el balance inicial`);
  }
  
  console.log('='.repeat(60) + '\n');
});

// Manejo de errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Error no manejado:', error);
});
