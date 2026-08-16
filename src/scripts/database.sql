-- MariaDB database schema for M-PESA transaction and configuration tables

-- --------------------------------------------------------
-- Table: mpesa_transaction_logs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mpesa_transaction_logs` (
  `id` varchar(36) NOT NULL,
  `business_id` varchar(36) NOT NULL,
  `store_id` varchar(36) DEFAULT NULL,
  `config_id` varchar(36) DEFAULT NULL,
  `transaction_type` enum('STK_PUSH','C2B','B2C','REVERSAL','BALANCE_QUERY','TRANSACTION_STATUS') NOT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT 0.00,
  `reference` varchar(255) DEFAULT NULL,
  `idempotency_key` varchar(255) DEFAULT NULL,
  `order_id` varchar(36) DEFAULT NULL,
  `invoice_id` varchar(36) DEFAULT NULL,
  `merchant_request_id` varchar(255) DEFAULT NULL,
  `checkout_request_id` varchar(255) DEFAULT NULL,
  `trans_id` varchar(50) DEFAULT NULL,
  `trans_time` varchar(50) DEFAULT NULL,
  `trans_amount` decimal(15,2) DEFAULT NULL,
  `bill_ref_number` varchar(255) DEFAULT NULL,
  `response_code` varchar(10) DEFAULT NULL,
  `response_description` text DEFAULT NULL,
  `result_code` int(11) DEFAULT NULL,
  `result_description` text DEFAULT NULL,
  `mpesa_receipt_number` varchar(50) DEFAULT NULL,
  `transaction_date` varchar(50) DEFAULT NULL,
  `callback_metadata` longtext DEFAULT NULL,
  `callback_response` longtext DEFAULT NULL,
  `status` enum('PENDING','PROCESSING','SUCCESS','COMPLETED','FAILED','CANCELLED','TIMEOUT') DEFAULT 'PENDING',
  `error_message` text DEFAULT NULL,
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `business_id` (`business_id`),
  KEY `store_id` (`store_id`),
  KEY `transaction_type` (`transaction_type`),
  KEY `idempotency_key` (`idempotency_key`),
  KEY `order_id` (`order_id`),
  KEY `invoice_id` (`invoice_id`),
  KEY `merchant_request_id` (`merchant_request_id`),
  KEY `checkout_request_id` (`checkout_request_id`),
  KEY `trans_id` (`trans_id`),
  KEY `status` (`status`),
  KEY `created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: business_mpesa_configs
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `business_mpesa_configs` (
  `id` varchar(36) NOT NULL,
  `business_id` varchar(36) NOT NULL,
  `store_id` varchar(36) DEFAULT NULL,
  `business_name` varchar(255) DEFAULT NULL,
  `business_account_id` varchar(36) DEFAULT NULL,
  `consumer_key` varchar(500) DEFAULT NULL,
  `consumer_secret` text DEFAULT NULL,
  `passkey` text DEFAULT NULL,
  `shortcode` varchar(20) DEFAULT NULL,
  `till_number` varchar(20) DEFAULT NULL,
  `transaction_type` enum('CustomerPayBillOnline','CustomerBuyGoodsOnline') DEFAULT 'CustomerBuyGoodsOnline',
  `initiator_name` varchar(255) DEFAULT NULL,
  `security_credential` text DEFAULT NULL,
  `organization_name` varchar(255) DEFAULT NULL,
  `store_number` varchar(20) DEFAULT NULL,
  `webhook_secret` varchar(255) DEFAULT NULL,
  `environment` enum('sandbox','production') DEFAULT 'sandbox',
  `is_active` tinyint(1) DEFAULT 1,
  `is_default` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  `is_dirty` tinyint(1) DEFAULT 0,
  `last_synced` datetime DEFAULT NULL,
  `sync_version` int(11) DEFAULT 1,
  `sync_status` enum('pending','syncing','synced','failed') DEFAULT 'synced',
  `last_modified_by` varchar(36) DEFAULT NULL,
  `last_modified_source` enum('online','offline') DEFAULT 'online',
  `sync_attempts` int(11) DEFAULT 0,
  `sync_error` text DEFAULT NULL,
  `terminal_id` varchar(255) DEFAULT NULL,
  `offline_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `business_id` (`business_id`),
  KEY `store_id` (`store_id`),
  KEY `shortcode` (`shortcode`),
  KEY `till_number` (`till_number`),
  KEY `environment` (`environment`),
  KEY `is_active` (`is_active`),
  KEY `is_default` (`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table: business_mpesa_callbacks
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `business_mpesa_callbacks` (
  `id` varchar(36) NOT NULL,
  `business_id` varchar(36) NOT NULL,
  `store_id` varchar(36) DEFAULT NULL,
  `mpesa_config_id` varchar(36) DEFAULT NULL,
  `callback_type` enum('stk_push','b2c_result','b2c_timeout','c2b_validation','c2b_confirmation','transaction_status_result','transaction_status_timeout','reversal_result','reversal_timeout','account_balance_result','account_balance_timeout','custom') DEFAULT 'stk_push',
  `callback_url` text NOT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `is_default` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  `is_dirty` tinyint(1) DEFAULT 0,
  `last_synced` datetime DEFAULT NULL,
  `sync_version` int(11) DEFAULT 1,
  `sync_status` enum('pending','syncing','synced','failed') DEFAULT 'synced',
  `last_modified_by` varchar(36) DEFAULT NULL,
  `last_modified_source` enum('online','offline') DEFAULT 'online',
  PRIMARY KEY (`id`),
  KEY `business_id` (`business_id`),
  KEY `store_id` (`store_id`),
  KEY `mpesa_config_id` (`mpesa_config_id`),
  KEY `callback_type` (`callback_type`),
  KEY `is_active` (`is_active`),
  KEY `is_default` (`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Optional: Add foreign key constraints (if needed)
-- --------------------------------------------------------
-- ALTER TABLE `mpesa_transaction_logs`
--   ADD CONSTRAINT `fk_mpesa_transaction_logs_config` FOREIGN KEY (`config_id`) REFERENCES `business_mpesa_configs` (`id`) ON DELETE SET NULL;
--
-- ALTER TABLE `business_mpesa_callbacks`
--   ADD CONSTRAINT `fk_business_mpesa_callbacks_config` FOREIGN KEY (`mpesa_config_id`) REFERENCES `business_mpesa_configs` (`id`) ON DELETE CASCADE;