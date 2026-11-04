-- =====================================================================
-- TurfLaunch — production schema for MySQL 8 / MariaDB 10.4+
-- Target: sq1301.alchosting.xyz  DB: alcy_42527633_freefiresaas
--
-- Run once (e.g. via phpMyAdmin "Import" or the mysql CLI):
--   mysql -h sq1301.alchosting.xyz -u alcy_42527633 -p \
--         alcy_42527633_freefiresaas < deploy/mysql-schema.sql
--
-- Idempotent: safe to re-run. No data is dropped.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Customers & authentication
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(80)  NOT NULL,
  `email`          VARCHAR(160) NOT NULL,
  `password_hash`  VARCHAR(255) NOT NULL,           -- scrypt$salt$hash
  `email_verified` TINYINT(1)   NOT NULL DEFAULT 0,
  `status`         ENUM('active','suspended','deactivated') NOT NULL DEFAULT 'active',
  `created_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_customers_email` (`email`),
  KEY `ix_customers_status` (`status`),
  KEY `ix_customers_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_sessions` (
  `token`       CHAR(64)     NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `expires_at`  DATETIME(3)  NOT NULL,
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ip`          VARCHAR(64)  DEFAULT NULL,
  `user_agent`  VARCHAR(300) DEFAULT NULL,
  PRIMARY KEY (`token`),
  KEY `ix_sessions_customer` (`customer_id`),
  CONSTRAINT `fk_sessions_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `reset_tokens` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `token_hash`  CHAR(64)     NOT NULL,              -- sha256(token)
  `purpose`     ENUM('password_reset','email_verify') NOT NULL DEFAULT 'password_reset',
  `expires_at`  DATETIME(3)  NOT NULL,
  `used_at`     DATETIME(3)  DEFAULT NULL,
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_reset_customer` (`customer_id`),
  KEY `ix_reset_hash` (`token_hash`),
  CONSTRAINT `fk_reset_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Main administrators & staff roles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(80)  NOT NULL,
  `email`         VARCHAR(160) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          ENUM('owner','staff') NOT NULL DEFAULT 'staff',
  `active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_admins_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `admin_sessions` (
  `token`      CHAR(64)     NOT NULL,
  `admin_id`   INT UNSIGNED NOT NULL,
  `expires_at` DATETIME(3)  NOT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `ip`         VARCHAR(64)  DEFAULT NULL,
  `user_agent` VARCHAR(300) DEFAULT NULL,
  PRIMARY KEY (`token`),
  KEY `ix_admin_sessions_admin` (`admin_id`),
  CONSTRAINT `fk_admin_sessions_admin` FOREIGN KEY (`admin_id`)
    REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Plans & subscriptions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `plans` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(40)  NOT NULL,
  `slug`          VARCHAR(60)  NOT NULL,
  `cycle`         ENUM('monthly','yearly') NOT NULL,
  `price_cents`   INT          NOT NULL,
  `setup_fee_cents` INT        NOT NULL DEFAULT 0,   -- one-time charge, first order only
  `currency`      VARCHAR(8)   NOT NULL DEFAULT 'INR',
  `duration_days` INT          NOT NULL,
  `features`      JSON         NOT NULL,
  `description`   VARCHAR(200) NOT NULL DEFAULT '',
  `active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `featured`      TINYINT(1)   NOT NULL DEFAULT 0,
  `sort`          INT          NOT NULL DEFAULT 0,
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_plans_slug` (`slug`),
  KEY `ix_plans_active_sort` (`active`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `subscriptions` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `plan_id`     INT UNSIGNED NOT NULL,
  `status`      ENUM('active','expired','revoked') NOT NULL DEFAULT 'active',
  `starts_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at`  DATETIME(3)  NOT NULL,
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_subscriptions_customer` (`customer_id`, `status`),
  KEY `ix_subscriptions_expiry` (`expires_at`),
  CONSTRAINT `fk_subs_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subs_plan` FOREIGN KEY (`plan_id`)
    REFERENCES `plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Orders & payments (manual UPI verification)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `orders` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_code`  VARCHAR(32)  NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `plan_id`     INT UNSIGNED NOT NULL,
  `amount_cents` INT         NOT NULL,
  `setup_fee_cents` INT      NOT NULL DEFAULT 0,     -- portion of amount_cents that was one-time
  `currency`    VARCHAR(8)   NOT NULL DEFAULT 'INR',
  `status`      ENUM('pending','approved','rejected','refunded') NOT NULL DEFAULT 'pending',
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_orders_code` (`order_code`),
  KEY `ix_orders_customer` (`customer_id`, `created_at`),
  CONSTRAINT `fk_orders_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_orders_plan` FOREIGN KEY (`plan_id`)
    REFERENCES `plans` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payments` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`      INT UNSIGNED NOT NULL,
  `customer_id`   INT UNSIGNED NOT NULL,
  `method`        VARCHAR(32)  NOT NULL DEFAULT 'upi_manual',
  `amount_cents`  INT          NOT NULL,
  `currency`      VARCHAR(8)   NOT NULL DEFAULT 'INR',
  `reference`     VARCHAR(80)  DEFAULT NULL,        -- UPI UTR
  `proof_name`    VARCHAR(120) DEFAULT NULL,        -- private file in storage/proofs
  `status`        ENUM('pending','approved','rejected','refunded') NOT NULL DEFAULT 'pending',
  `reject_reason` VARCHAR(300) DEFAULT NULL,
  `verified_by`   INT UNSIGNED DEFAULT NULL,
  `verified_at`   DATETIME(3)  DEFAULT NULL,
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_payments_customer` (`customer_id`, `created_at`),
  KEY `ix_payments_status` (`status`),
  KEY `ix_payments_order` (`order_id`),
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_payments_admin` FOREIGN KEY (`verified_by`)
    REFERENCES `admins` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Branding (per-customer identity + Firebase config)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `branding` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`         INT UNSIGNED NOT NULL,
  `app_name`            VARCHAR(40)  DEFAULT NULL,
  `tenant_id`           VARCHAR(60)  DEFAULT NULL,
  `logo_name`           VARCHAR(120) DEFAULT NULL,
  `brand_primary`       VARCHAR(9)   DEFAULT NULL,
  `brand_secondary`     VARCHAR(9)   DEFAULT NULL,
  `firebase_project_id` VARCHAR(120) DEFAULT NULL,
  `firebase_app_id`     VARCHAR(160) DEFAULT NULL,
  `firebase_api_key`    VARCHAR(200) DEFAULT NULL,
  `notes`               VARCHAR(1000) DEFAULT NULL,
  `status`              ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
  `updated_at`          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_branding_customer` (`customer_id`),
  UNIQUE KEY `ux_branding_tenant` (`tenant_id`),
  CONSTRAINT `fk_branding_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- APK releases (manually uploaded, never auto-built)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `apk_releases` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id`   INT UNSIGNED NOT NULL,
  `app_type`      ENUM('user','admin') NOT NULL,
  `app_name`      VARCHAR(80)  NOT NULL,
  `version_name`  VARCHAR(30)  NOT NULL,
  `version_code`  INT          DEFAULT NULL,
  `file_name`     VARCHAR(120) NOT NULL,
  `file_size`     INT          NOT NULL,
  `sha256`        CHAR(64)     NOT NULL,
  `release_notes` VARCHAR(1000) DEFAULT NULL,
  `published`     TINYINT(1)   NOT NULL DEFAULT 0,
  `superseded`    TINYINT(1)   NOT NULL DEFAULT 0,
  `uploaded_by`   INT UNSIGNED DEFAULT NULL,
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_apk_customer` (`customer_id`, `app_type`),
  KEY `ix_apk_published` (`published`, `superseded`),
  CONSTRAINT `fk_apk_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_apk_admin` FOREIGN KEY (`uploaded_by`)
    REFERENCES `admins` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Audit, notifications, download logs, content
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_type` ENUM('customer','admin','system') NOT NULL DEFAULT 'system',
  `actor_id`   INT UNSIGNED DEFAULT NULL,
  `action`     VARCHAR(80)  NOT NULL,
  `entity`     VARCHAR(40)  DEFAULT NULL,
  `entity_id`  VARCHAR(40)  DEFAULT NULL,
  `meta`       JSON         DEFAULT NULL,
  `ip`         VARCHAR(64)  DEFAULT NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_audit_created` (`created_at`),
  KEY `ix_audit_entity` (`entity`, `entity_id`),
  KEY `ix_audit_actor` (`actor_type`, `actor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `type`        ENUM('info','success','warning','danger') NOT NULL DEFAULT 'info',
  `title`       VARCHAR(160) NOT NULL,
  `body`        VARCHAR(1000) NOT NULL DEFAULT '',
  `read`        TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_notif_customer` (`customer_id`, `created_at`),
  CONSTRAINT `fk_notif_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `download_log` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` INT UNSIGNED NOT NULL,
  `apk_id`      INT UNSIGNED NOT NULL,
  `ip`          VARCHAR(64)  DEFAULT NULL,
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ix_dl_customer` (`customer_id`, `created_at`),
  CONSTRAINT `fk_dl_customer` FOREIGN KEY (`customer_id`)
    REFERENCES `customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dl_apk` FOREIGN KEY (`apk_id`)
    REFERENCES `apk_releases` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `site_settings` (
  `key`        VARCHAR(60)  NOT NULL,
  `value`      JSON         NOT NULL,
  `updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- Seed content (plans + site copy). Prices are managed from the admin panel.
-- =====================================================================
-- Single plan: ₹299 one-time setup + ₹50 per month.
INSERT INTO `plans`
  (`name`,`slug`,`cycle`,`price_cents`,`setup_fee_cents`,`currency`,`duration_days`,`features`,`description`,`active`,`featured`,`sort`)
SELECT * FROM (
  SELECT 'Tournament App' AS n,'tournament-app-monthly' AS s,'monthly' AS c,
         5000 AS p,29900 AS sf,'INR' AS cur,30 AS d,
         JSON_ARRAY('Custom app name & logo','Your own tenant identifier','User Panel APK + Admin Panel APK','Customer-specific Firebase configuration where applicable','Instant UPI checkout with automatic activation','Secure dashboard downloads with SHA-256 checksums','Email support') AS f,
         '₹299 one-time setup + ₹50/month. Your branded User and Admin APKs, prepared manually by our team.' AS de,
         1 AS a,1 AS fe,1 AS so
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM `plans`);

-- First administrator is created securely through /admin/bootstrap (never via SQL).
