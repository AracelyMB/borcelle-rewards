#!/usr/bin/env node

/**
 * SCRIPT DE TESTING AUTOMATIZADO
 * 
 * Verifica que el sistema de recompensas funcione correctamente
 */

const { ethers } = require('ethers');
require('dotenv').config();

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "0x3efbce682b32f495b4912f3866ce69da1a2d7e5c";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const BUSINESS_PRIVATE_KEY = process.env.BUSINESS_PRIVATE_KEY;

const ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

console.log('\n' + '='.repeat(70));
console.log('🧪 SCRIPT DE TESTING - SISTEMA DE RECOMPENSAS ARY');
console.log('='.repeat(70) + '\n');

async function runTests() {
  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // TEST 1: Verificar variables de entorno
  console.log('📋 TEST 1: Verificar variables de entorno');
  console.log('-'.repeat(70));
  
  if (!SEPOLIA_RPC_URL) {
    console.log('❌ SEPOLIA_RPC_URL no configurada');
    results.failed++;
  } else {
    console.log('✅ SEPOLIA_RPC_URL configurada');
    results.passed++;
  }
  
  if (!BUSINESS_PRIVATE_KEY) {
    console.log('❌ BUSINESS_PRIVATE_KEY no configurada');
    results.failed++;
  } else {
    console.log('✅ BUSINESS_PRIVATE_KEY configurada');
    results.passed++;
  }
  
  console.log('');

  if (!SEPOLIA_RPC_URL || !BUSINESS_PRIVATE_KEY) {
    console.log('❌ Configuración incompleta. Verifica tu archivo .env\n');
    return results;
  }

  // TEST 2: Conectar al proveedor RPC
  console.log('📋 TEST 2: Conexión al proveedor RPC');
  console.log('-'.repeat(70));
  
  let provider, wallet;
  
  try {
    provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const network = await provider.getNetwork();
    
    if (network.chainId === 11155111n) {
      console.log('✅ Conectado a Sepolia (chainId: 11155111)');
      results.passed++;
    } else {
      console.log(`⚠️  Conectado a red ${network.name} (chainId: ${network.chainId})`);
      console.log('   Esperábamos Sepolia (11155111)');
      results.warnings++;
    }
  } catch (error) {
    console.log('❌ Error al conectar al RPC:', error.message);
    results.failed++;
    return results;
  }
  
  console.log('');

  // TEST 3: Validar la wallet del negocio
  console.log('📋 TEST 3: Validar wallet del negocio');
  console.log('-'.repeat(70));
  
  try {
    wallet = new ethers.Wallet(BUSINESS_PRIVATE_KEY, provider);
    console.log('✅ Wallet del negocio:', wallet.address);
    results.passed++;
  } catch (error) {
    console.log('❌ Error al cargar la wallet:', error.message);
    results.failed++;
    return results;
  }
  
  console.log('');

  // TEST 4: Verificar balance de ETH
  console.log('📋 TEST 4: Balance de ETH (para gas)');
  console.log('-'.repeat(70));
  
  try {
    const ethBalance = await provider.getBalance(wallet.address);
    const ethFormatted = ethers.formatEther(ethBalance);
    
    console.log(`   Balance: ${ethFormatted} ETH`);
    
    if (parseFloat(ethFormatted) > 0.01) {
      console.log('✅ Balance de ETH suficiente para transacciones');
      results.passed++;
    } else if (parseFloat(ethFormatted) > 0) {
      console.log('⚠️  Balance de ETH bajo. Considera recargar.');
      console.log('   Recomendado: mínimo 0.1 ETH');
      results.warnings++;
    } else {
      console.log('❌ Sin ETH para pagar gas');
      console.log('   Obtén ETH gratis en: https://sepoliafaucet.com/');
      results.failed++;
    }
  } catch (error) {
    console.log('❌ Error al verificar balance ETH:', error.message);
    results.failed++;
  }
  
  console.log('');

  // TEST 5: Verificar contrato ARY
  console.log('📋 TEST 5: Verificar contrato ARY');
  console.log('-'.repeat(70));
  
  let contract;
  
  try {
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals()
    ]);
    
    console.log(`✅ Contrato encontrado en: ${CONTRACT_ADDRESS}`);
    console.log(`   Nombre: ${name}`);
    console.log(`   Símbolo: ${symbol}`);
    console.log(`   Decimales: ${decimals}`);
    results.passed++;
  } catch (error) {
    console.log('❌ Error al leer el contrato:', error.message);
    console.log('   Verifica que la dirección del contrato sea correcta');
    results.failed++;
    return results;
  }
  
  console.log('');

  // TEST 6: Verificar balance de ARY
  console.log('📋 TEST 6: Balance de ARY tokens');
  console.log('-'.repeat(70));
  
  try {
    const aryBalance = await contract.balanceOf(wallet.address);
    const decimals = await contract.decimals();
    const symbol = await contract.symbol();
    const aryFormatted = ethers.formatUnits(aryBalance, decimals);
    
    console.log(`   Balance: ${aryFormatted} ${symbol}`);
    
    if (parseFloat(aryFormatted) >= 100) {
      console.log('✅ Balance de ARY suficiente para recompensas');
      results.passed++;
    } else if (parseFloat(aryFormatted) > 0) {
      console.log('⚠️  Balance de ARY bajo. Considera transferir más tokens.');
      results.warnings++;
    } else {
      console.log('❌ Sin tokens ARY para enviar recompensas');
      console.log('   Transfiere ARY tokens a la wallet del negocio');
      results.failed++;
    }
  } catch (error) {
    console.log('❌ Error al verificar balance ARY:', error.message);
    results.failed++;
  }
  
  console.log('');

  // TEST 7: Verificar puertos disponibles
  console.log('📋 TEST 7: Verificar disponibilidad de puertos');
  console.log('-'.repeat(70));
  
  const net = require('net');
  
  const checkPort = (port) => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port);
    });
  };
  
  const port3000 = await checkPort(3000);
  const port3001 = await checkPort(3001);
  
  if (port3000) {
    console.log('✅ Puerto 3000 disponible (servidor principal)');
    results.passed++;
  } else {
    console.log('⚠️  Puerto 3000 en uso (puede que ya esté corriendo el servidor)');
    results.warnings++;
  }
  
  if (port3001) {
    console.log('✅ Puerto 3001 disponible (servidor quick test)');
    results.passed++;
  } else {
    console.log('⚠️  Puerto 3001 en uso');
    results.warnings++;
  }
  
  console.log('');

  return results;
}

// Ejecutar tests
runTests().then(results => {
  console.log('='.repeat(70));
  console.log('📊 RESULTADOS DEL TEST');
  console.log('='.repeat(70));
  console.log(`✅ Tests pasados: ${results.passed}`);
  console.log(`⚠️  Advertencias: ${results.warnings}`);
  console.log(`❌ Tests fallidos: ${results.failed}`);
  console.log('='.repeat(70));
  
  if (results.failed === 0 && results.warnings === 0) {
    console.log('\n🎉 ¡TODO LISTO! El sistema está configurado correctamente.\n');
    console.log('Próximos pasos:');
    console.log('1. Ejecuta: node server-improved.js');
    console.log('2. Abre frontend/index.html en tu navegador');
    console.log('3. ¡Prueba el sistema de recompensas!\n');
  } else if (results.failed === 0) {
    console.log('\n⚠️  Configuración funcional pero con advertencias.');
    console.log('Revisa los puntos marcados arriba.\n');
  } else {
    console.log('\n❌ Hay problemas que deben resolverse antes de continuar.');
    console.log('Revisa los errores marcados arriba.\n');
  }
  
  process.exit(results.failed > 0 ? 1 : 0);
}).catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});
