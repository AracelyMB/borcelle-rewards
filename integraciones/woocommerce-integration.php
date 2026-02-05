/**
 * INTEGRACIÓN CON WOOCOMMERCE
 * 
 * Este código añade un campo de wallet en el checkout y envía
 * recompensas ARY automáticamente cuando se completa una compra.
 * 
 * INSTALACIÓN:
 * 1. Copia este código en functions.php de tu tema
 * 2. O créalo como un plugin personalizado
 * 3. Cambia ARY_API_URL por tu servidor real
 */

// ========================================
// CONFIGURACIÓN
// ========================================

define('ARY_API_URL', 'http://localhost:3000/api'); // Cambia esto en producción

// ========================================
// 1. AÑADIR CAMPO DE WALLET EN CHECKOUT
// ========================================

add_action('woocommerce_after_order_notes', 'ary_add_wallet_field');

function ary_add_wallet_field($checkout) {
    echo '<div id="ary_wallet_field">';
    
    woocommerce_form_field('customer_wallet', array(
        'type'        => 'text',
        'class'       => array('form-row-wide'),
        'label'       => __('Wallet de MetaMask (opcional)'),
        'placeholder' => __('0x...'),
        'description' => __('Ingresa tu dirección de MetaMask para recibir 5 ARY tokens como recompensa. <a href="https://metamask.io" target="_blank">¿Qué es MetaMask?</a>'),
        'required'    => false,
    ), $checkout->get_value('customer_wallet'));
    
    echo '</div>';
    
    // Script para validar el formato
    ?>
    <script type="text/javascript">
    jQuery(function($){
        $('input[name="customer_wallet"]').on('blur', function(){
            var wallet = $(this).val();
            if (wallet && !wallet.match(/^0x[a-fA-F0-9]{40}$/)) {
                alert('La dirección de wallet no es válida. Debe empezar con 0x y tener 42 caracteres.');
                $(this).val('');
            }
        });
    });
    </script>
    <?php
}

// ========================================
// 2. VALIDAR EL CAMPO (OPCIONAL)
// ========================================

add_action('woocommerce_checkout_process', 'ary_validate_wallet_field');

function ary_validate_wallet_field() {
    $wallet = isset($_POST['customer_wallet']) ? sanitize_text_field($_POST['customer_wallet']) : '';
    
    // Si el cliente ingresó una wallet, validar formato
    if (!empty($wallet) && !preg_match('/^0x[a-fA-F0-9]{40}$/', $wallet)) {
        wc_add_notice(__('La dirección de wallet no es válida.'), 'error');
    }
}

// ========================================
// 3. GUARDAR LA WALLET EN LA ORDEN
// ========================================

add_action('woocommerce_checkout_update_order_meta', 'ary_save_wallet_field');

function ary_save_wallet_field($order_id) {
    if (!empty($_POST['customer_wallet'])) {
        update_post_meta($order_id, 'customer_wallet', sanitize_text_field($_POST['customer_wallet']));
    }
}

// ========================================
// 4. MOSTRAR WALLET EN ADMIN
// ========================================

add_action('woocommerce_admin_order_data_after_billing_address', 'ary_display_wallet_in_admin');

function ary_display_wallet_in_admin($order) {
    $wallet = get_post_meta($order->get_id(), 'customer_wallet', true);
    if ($wallet) {
        echo '<p><strong>' . __('Wallet MetaMask') . ':</strong><br>' . esc_html($wallet) . '</p>';
    }
}

// ========================================
// 5. ENVIAR RECOMPENSA CUANDO SE COMPLETA EL PAGO
// ========================================

add_action('woocommerce_payment_complete', 'ary_send_reward_on_purchase');
add_action('woocommerce_order_status_completed', 'ary_send_reward_on_purchase');

function ary_send_reward_on_purchase($order_id) {
    // Evitar envíos duplicados
    if (get_post_meta($order_id, '_ary_reward_sent', true)) {
        return;
    }
    
    // Obtener la wallet del cliente
    $wallet = get_post_meta($order_id, 'customer_wallet', true);
    
    // Si no hay wallet, no hacer nada
    if (empty($wallet)) {
        return;
    }
    
    $order = wc_get_order($order_id);
    
    // Registrar la wallet (si es nueva)
    ary_register_wallet($wallet, $order);
    
    // Enviar la recompensa
    $result = ary_send_reward($wallet, $order_id, $order->get_total());
    
    if ($result && isset($result['success']) && $result['success']) {
        // Marcar como enviado
        update_post_meta($order_id, '_ary_reward_sent', true);
        update_post_meta($order_id, '_ary_tx_hash', $result['reward']['txHash']);
        
        // Añadir nota a la orden
        $order->add_order_note(
            sprintf(
                __('Recompensa ARY enviada: %s. TX: %s'),
                $result['reward']['amount'],
                $result['reward']['txHash']
            )
        );
        
        // Enviar email al cliente
        ary_send_reward_email($order, $result);
        
    } else {
        // Log del error
        error_log('ARY Reward Error: ' . print_r($result, true));
        
        $order->add_order_note(
            __('Error al enviar recompensa ARY. Revisar logs.')
        );
    }
}

// ========================================
// 6. FUNCIONES AUXILIARES
// ========================================

function ary_register_wallet($wallet, $order) {
    $data = array(
        'walletAddress' => $wallet,
        'name'          => $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(),
        'email'         => $order->get_billing_email()
    );
    
    $response = wp_remote_post(ARY_API_URL . '/register-wallet', array(
        'headers' => array('Content-Type' => 'application/json'),
        'body'    => json_encode($data),
        'timeout' => 45
    ));
    
    if (is_wp_error($response)) {
        error_log('ARY Register Error: ' . $response->get_error_message());
        return false;
    }
    
    return json_decode(wp_remote_retrieve_body($response), true);
}

function ary_send_reward($wallet, $order_id, $amount) {
    $data = array(
        'walletAddress'  => $wallet,
        'purchaseId'     => $order_id,
        'purchaseAmount' => $amount
    );
    
    $response = wp_remote_post(ARY_API_URL . '/send-reward', array(
        'headers' => array('Content-Type' => 'application/json'),
        'body'    => json_encode($data),
        'timeout' => 60 // Dar tiempo a la blockchain
    ));
    
    if (is_wp_error($response)) {
        error_log('ARY Send Reward Error: ' . $response->get_error_message());
        return false;
    }
    
    return json_decode(wp_remote_retrieve_body($response), true);
}

function ary_send_reward_email($order, $result) {
    $to      = $order->get_billing_email();
    $subject = '🎁 ¡Has recibido ' . $result['reward']['amount'] . '!';
    
    $message = sprintf(
        "Hola %s,\n\n" .
        "¡Gracias por tu compra en Borcelle!\n\n" .
        "Has recibido %s como recompensa en tu wallet de MetaMask.\n\n" .
        "Detalles de la transacción:\n" .
        "• Cantidad: %s\n" .
        "• Wallet: %s\n" .
        "• Hash: %s\n" .
        "• Ver en Etherscan: %s\n\n" .
        "Para ver tus tokens en MetaMask:\n" .
        "1. Abre MetaMask\n" .
        "2. Ve a 'Assets' → 'Import tokens'\n" .
        "3. Pega esta dirección: 0x3efbce682b32f495b4912f3866ce69da1a2d7e5c\n" .
        "4. Symbol: ARY\n" .
        "5. Decimals: 18\n\n" .
        "¡Disfruta tus recompensas!\n\n" .
        "Equipo Borcelle",
        $order->get_billing_first_name(),
        $result['reward']['amount'],
        $result['reward']['amount'],
        $result['reward']['recipient'],
        $result['reward']['txHash'],
        $result['reward']['explorerUrl']
    );
    
    wp_mail($to, $subject, $message);
}

// ========================================
// 7. WIDGET DE RECOMPENSAS EN MY ACCOUNT
// ========================================

add_action('woocommerce_account_dashboard', 'ary_display_rewards_widget');

function ary_display_rewards_widget() {
    $user_id = get_current_user_id();
    
    // Obtener todas las órdenes del usuario con recompensas
    $orders = wc_get_orders(array(
        'customer_id' => $user_id,
        'limit'       => -1,
        'meta_key'    => '_ary_reward_sent',
        'meta_value'  => true
    ));
    
    if (empty($orders)) {
        return;
    }
    
    $total_rewards = count($orders) * 5; // 5 ARY por orden
    
    ?>
    <div class="ary-rewards-widget" style="background: #f8f8f8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3>💎 Tus Recompensas ARY</h3>
        <p><strong>Total de recompensas:</strong> <?php echo $total_rewards; ?> ARY</p>
        <p><strong>Número de compras:</strong> <?php echo count($orders); ?></p>
        
        <h4>Últimas recompensas:</h4>
        <ul>
        <?php
        $recent = array_slice($orders, 0, 5);
        foreach ($recent as $order) {
            $tx_hash = get_post_meta($order->get_id(), '_ary_tx_hash', true);
            $date = $order->get_date_created();
            ?>
            <li>
                Orden #<?php echo $order->get_id(); ?> - 
                <?php echo $date->format('d/m/Y'); ?> - 
                5 ARY
                <?php if ($tx_hash): ?>
                    <a href="https://sepolia.etherscan.io/tx/<?php echo esc_attr($tx_hash); ?>" 
                       target="_blank"
                       style="color: #2196F3;">
                        Ver TX
                    </a>
                <?php endif; ?>
            </li>
            <?php
        }
        ?>
        </ul>
    </div>
    <?php
}

// ========================================
// 8. SHORTCODE PARA MOSTRAR RECOMPENSAS
// ========================================

add_shortcode('ary_rewards_info', 'ary_rewards_shortcode');

function ary_rewards_shortcode($atts) {
    ob_start();
    ?>
    <div class="ary-info-box" style="background: linear-gradient(135deg, #1f1f1f, #000000); color: white; padding: 30px; border-radius: 15px; text-align: center;">
        <h2 style="color: #f4c430;">🎁 Gana ARY Tokens</h2>
        <p style="font-size: 1.2rem;">Por cada compra recibe <strong>5 ARY tokens</strong> gratis en tu wallet de MetaMask</p>
        
        <div style="margin: 20px 0;">
            <p><strong>Beneficios de ARY tokens:</strong></p>
            <ul style="list-style: none; padding: 0;">
                <li>✅ Descuentos exclusivos</li>
                <li>✅ Acceso a productos limitados</li>
                <li>✅ Sorteos mensuales</li>
                <li>✅ Recompensas acumulativas</li>
            </ul>
        </div>
        
        <a href="https://metamask.io" 
           target="_blank" 
           style="display: inline-block; background: #f4c430; color: #000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Instalar MetaMask
        </a>
    </div>
    <?php
    return ob_get_clean();
}

// Uso: [ary_rewards_info] en cualquier página/post
