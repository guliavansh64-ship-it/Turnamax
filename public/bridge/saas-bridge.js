/**
 * Tournamax SaaS Platform Compatibility & Subscription Enforcement Bridge
 * Handles real-time synchronization, warning popups, non-dismissible locks,
 * and ZetPay automated UPI checkout across Tournament Admin and User APKs.
 */
(function() {
  'use strict';

  // 1. Identify Tenant
  function getTenantSlug() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const fromUrl = urlParams.get('tenant') || urlParams.get('t');
      if (fromUrl) {
        localStorage.setItem('tournamax_tenant_slug', fromUrl);
        return fromUrl;
      }
      const meta = document.querySelector('meta[name="tournamax-tenant"]');
      if (meta && meta.content) return meta.content;
      const cached = localStorage.getItem('tournamax_tenant_slug');
      if (cached) return cached;
      if (window.__TOURNAMAX_TENANT__) return window.__TOURNAMAX_TENANT__;
    } catch (e) {}
    return 'starter';
  }

  const tenantSlug = getTenantSlug();
  const isAdminPanel = Boolean(
    window.location.pathname.includes('admin') ||
    document.title.toLowerCase().includes('admin') ||
    document.getElementById('adminSidebar') ||
    document.getElementById('adminLoginForm')
  );

  // Demo App Detection: template previews and demo accounts should NEVER show restriction screen
  function isDemoApp() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('demo') === 'true' || urlParams.get('demo') === '1') return true;
      const path = (window.location.pathname || '').toLowerCase();
      if (path.includes('/templates/') || path.includes('admin-panel.html') || path.includes('user-panel.html')) return true;
      const metaDemo = document.querySelector('meta[name="tournamax-demo"]');
      if (metaDemo && (metaDemo.content === 'true' || metaDemo.content === '1')) return true;
      if (window.__TOURNAMAX_IS_DEMO__ === true) return true;
      const metaTenant = document.querySelector('meta[name="tournamax-tenant"]');
      if (metaTenant && metaTenant.content === 'demo') return true;
      const fromUrl = urlParams.get('tenant') || urlParams.get('t');
      // If no explicit tenant in URL and default demo slugs
      if (!fromUrl && (tenantSlug === 'demo' || tenantSlug === 'starter' || tenantSlug === 'preview' || tenantSlug === 'template')) {
        return true;
      }
      if (tenantSlug === 'demo' || tenantSlug === 'preview' || tenantSlug === 'template') return true;
    } catch (e) {}
    return false;
  }

  let currentStatus = null;
  let lockOverlayEl = null;
  let warningBannerEl = null;
  let zetpayPollInterval = null;

  // Inject required styles for animations
  function ensureStyles() {
    if (document.getElementById('tournamax-bridge-styles')) return;
    const style = document.createElement('style');
    style.id = 'tournamax-bridge-styles';
    style.textContent = `
      @keyframes tournamaxSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes tournamaxSlideIn {
        from { opacity: 0; transform: translateY(-16px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }
  ensureStyles();

  // 2. Fetch Subscription Status from Backend
  async function checkSubscription() {
    try {
      // In demo app, immediately ensure no lock screens exist
      if (isDemoApp()) {
        removeLockScreen();
        removeUserLockScreen();
        removeWarningBanner();
      }

      const res = await fetch('/api/v1/subscription/status?tenant=' + encodeURIComponent(tenantSlug), {
        cache: 'no-store'
      });
      if (!res.ok) return;
      const json = await res.json();
      if (!json || !json.data) return;
      currentStatus = json.data;
      applySubscriptionRules(json.data);
    } catch (err) {
      console.warn('[Tournamax Bridge] Subscription sync check notice:', err);
    }
  }

  // 3. Apply Enforcement Rules
  function applySubscriptionRules(sub) {
    // If running in demo app or backend confirms is_demo, NEVER lock or restrict
    if (isDemoApp() || sub.is_demo) {
      removeLockScreen();
      removeUserLockScreen();
      removeWarningBanner();
      console.log('[Tournamax Bridge] Demo App active — subscription lock bypassed. All features unlocked.');
      return;
    }

    if (isAdminPanel) {
      handleAdminRules(sub);
    } else {
      handleUserRules(sub);
    }
  }

  /* ==============================================================
     TOURNAMENT ADMIN APK ENFORCEMENT RULES
     ============================================================== */
  function handleAdminRules(sub) {
    if (isDemoApp() || sub.is_demo) {
      removeLockScreen();
      removeWarningBanner();
      return;
    }

    // A. EXPIRY LOCK: subscription is expired or tenant suspended
    if (sub.admin_locked) {
      removeWarningBanner();
      showAdminLockScreen(sub);
    } else {
      removeLockScreen();

      // B. EXPIRY WARNING: 2-3 days before expiry
      if (sub.admin_warning) {
        showAdminWarningPopup(sub);
      } else {
        removeWarningBanner();
      }
    }
  }

  // Admin Warning Popup (Dismissible)
  function showAdminWarningPopup(sub) {
    if (isDemoApp() || sub.is_demo) return;
    if (sessionStorage.getItem('tournamax_sub_warn_dismissed') === '1') return;
    if (document.getElementById('tournamax-admin-warn-popup')) return;

    const banner = document.createElement('div');
    banner.id = 'tournamax-admin-warn-popup';
    banner.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      max-width: 420px;
      width: calc(100% - 32px);
      z-index: 99999;
      background: linear-gradient(135deg, #1c1917, #292524);
      border: 1px solid #f59e0b;
      box-shadow: 0 10px 25px rgba(0,0,0,0.6), 0 0 15px rgba(245,158,11,0.2);
      border-radius: 12px;
      padding: 16px;
      color: #f3f4f6;
      font-family: 'Poppins', -apple-system, sans-serif;
      animation: tournamaxSlideIn 0.35s ease-out;
    `;

    const formattedExpiry = sub.expires_at ? new Date(sub.expires_at).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    }) : 'in ' + sub.days_remaining + ' days';

    const renewalAmount = sub.renewal_amount || 50;

    banner.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="font-size:24px;line-height:1;">⚠️</div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <strong style="color:#fbbf24;font-size:14px;letter-spacing:0.3px;">Subscription Expiring Soon</strong>
            <span style="background:rgba(245,158,11,0.2);color:#fbbf24;font-size:11px;padding:2px 8px;border-radius:20px;font-weight:600;">
              ${sub.days_remaining} ${sub.days_remaining === 1 ? 'Day' : 'Days'} Left
            </span>
          </div>
          <p style="margin:0 0 10px 0;font-size:12px;color:#d1d5db;line-height:1.5;">
            Your tournament hosting renewal is due on <strong>${formattedExpiry}</strong>. The renewal fee is <strong>₹${renewalAmount}</strong>. Renew via ZetPay for instant zero-downtime extension.
          </p>
          <div style="display:flex;gap:8px;">
            <button id="btnTournamaxWarnRenew" style="
              background: #22c55e;
              border: none;
              color: white;
              padding: 6px 14px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
            ">⚡ Renew Now (₹${renewalAmount})</button>
            <button id="btnTournamaxWarnDismiss" style="
              background: transparent;
              border: 1px solid #4b5563;
              color: #9ca3af;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
            ">Dismiss</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(banner);
    warningBannerEl = banner;

    document.getElementById('btnTournamaxWarnDismiss')?.addEventListener('click', () => {
      sessionStorage.setItem('tournamax_sub_warn_dismissed', '1');
      removeWarningBanner();
    });

    document.getElementById('btnTournamaxWarnRenew')?.addEventListener('click', () => {
      removeWarningBanner();
      if (typeof window.loadSubscriptionSection === 'function') {
        window.loadSubscriptionSection();
        const subNav = document.querySelector('[data-section="subscription-section"], #nav-subscription, #navLinkSubscription');
        if (subNav) subNav.click();
      } else {
        showAdminLockScreen(sub, false);
      }
    });
  }

  function removeWarningBanner() {
    if (warningBannerEl && warningBannerEl.parentNode) {
      warningBannerEl.parentNode.removeChild(warningBannerEl);
      warningBannerEl = null;
    }
  }

  // Admin Expiry Lock Screen (Full-Screen, Non-Dismissible for expired customer tenants)
  function showAdminLockScreen(sub, isMandatory = true) {
    // Demo app safeguard: never show lock screen in demo app
    if (isDemoApp() || sub.is_demo) {
      removeLockScreen();
      return;
    }

    if (document.getElementById('tournamax-admin-lock-screen')) return;

    // Prevent background scrolling
    if (isMandatory) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }

    const upiId = sub.upi_id || 'tournamax@upi';
    const amount = sub.renewal_amount || 50;
    const upiNote = 'Renewal-' + tenantSlug;
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=Tournamax&am=${amount}&cu=INR&tn=${encodeURIComponent(upiNote)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUri)}`;

    const overlay = document.createElement('div');
    overlay.id = 'tournamax-admin-lock-screen';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(8, 10, 15, 0.96);
      backdrop-filter: blur(12px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: 'Poppins', -apple-system, sans-serif;
      box-sizing: border-box;
      overflow-y: auto;
    `;

    overlay.innerHTML = `
      <div style="
        background: #141721;
        border: 1px solid #ef4444;
        border-radius: 16px;
        max-width: 520px;
        width: 100%;
        padding: 24px;
        color: #f3f4f6;
        box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 30px rgba(239, 68, 68, 0.25);
        text-align: center;
        box-sizing: border-box;
      ">
        <div style="
          width: 54px;
          height: 54px;
          margin: 0 auto 14px;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
        ">🔒</div>

        <h3 style="margin: 0 0 6px; color: #f87171; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">
          Tournament Admin Restricted
        </h3>
        <p style="margin: 0 0 16px; color: #9ca3af; font-size: 13px; line-height: 1.5;">
          ${sub.lock_message || 'Your hosting subscription expired. Management features are restricted until renewal payment is verified.'}
        </p>

        <!-- Renewal Pricing Header -->
        <div style="background:#0c0e15; border:1px solid #272d3d; border-radius:12px; padding:16px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid #1e2433; font-size:13px;">
            <span style="color:#9ca3af;">Renewal Fee:</span>
            <strong style="color:#22c55e; font-size:18px;">₹${amount} <span style="font-size:12px;color:#9ca3af;font-weight:normal;">/ 30 Days</span></strong>
          </div>

          <!-- PRIMARY PAYMENT OPTION: ZetPay Automated UPI Checkout -->
          <div style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(16, 185, 129, 0.04)); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 10px; padding: 14px; margin-bottom: 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:11px; font-weight:700; color:#4ade80; text-transform:uppercase; letter-spacing:0.5px;">⚡ Automatic UPI Checkout</span>
              <span style="background:rgba(34,197,94,0.2); color:#4ade80; font-size:10px; padding:2px 7px; border-radius:10px; font-weight:600;">Instant Auto-Unlock</span>
            </div>

            <p style="font-size:12px; color:#d1d5db; margin:0 0 12px; text-align:left; line-height:1.4;">
              Pay via <strong>ZetPay</strong> using Google Pay, PhonePe, Paytm, Cred, or any UPI app. Server auto-confirms payment and <strong>instantly unlocks your tournament management</strong>.
            </p>

            <!-- ZetPay Initial Button -->
            <div id="tournamaxZetpayInitialBox">
              <button type="button" id="btnTournamaxPayZetpay" style="
                width: 100%;
                background: linear-gradient(135deg, #22c55e, #16a34a);
                border: none;
                color: #ffffff;
                font-weight: 700;
                font-size: 14px;
                padding: 11px 16px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: 0 4px 14px rgba(34, 197, 94, 0.35);
              ">⚡ Pay ₹${amount} with ZetPay (Instant UPI)</button>
              <div id="tournamaxZetpayErrorMsg" style="display:none; color:#f87171; font-size:11px; margin-top:6px; text-align:left;"></div>
              <div style="display:flex; justify-content:center; align-items:center; gap:6px; margin-top:8px; font-size:10px; color:#9ca3af;">
                <span>🔒 ZetPay Verified Gateway</span>
                <span>•</span>
                <span>No UTR Proof Needed</span>
              </div>
            </div>

            <!-- ZetPay Polling / In-Progress View -->
            <div id="tournamaxZetpayPollingBox" style="display:none; text-align:center; padding:10px 0;">
              <div style="
                display:inline-block;
                width:28px;
                height:28px;
                border:3px solid rgba(34, 197, 94, 0.2);
                border-top-color:#22c55e;
                border-radius:50%;
                animation:tournamaxSpin 0.8s linear infinite;
                margin-bottom:8px;
              "></div>
              <div style="font-size:13px; font-weight:700; color:#f3f4f6; margin-bottom:4px;">
                Awaiting UPI Payment Confirmation…
              </div>
              <p style="font-size:11px; color:#9ca3af; margin:0 0 10px; line-height:1.4;">
                Complete the ₹${amount} payment in your UPI app. This screen will auto-unlock the moment ZetPay confirms.
              </p>
              <div style="display:flex; justify-content:center; gap:6px; flex-wrap:wrap;">
                <button type="button" id="btnTournamaxReopenPayment" style="
                  background:#2563eb; border:none; color:#fff; font-size:11px; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:600;
                ">Reopen Payment Link ↗</button>
                <button type="button" id="btnTournamaxCheckNow" style="
                  background:#374151; border:none; color:#f3f4f6; font-size:11px; padding:6px 12px; border-radius:6px; cursor:pointer;
                ">🔄 Check Status</button>
              </div>
              <div id="tournamaxPollingStatusText" style="font-size:11px; color:#9ca3af; margin-top:6px;"></div>
            </div>

            <!-- ZetPay Success Message -->
            <div id="tournamaxZetpaySuccessBox" style="display:none; text-align:center; padding:10px; background:rgba(34,197,94,0.15); border:1px solid #22c55e; border-radius:8px;">
              <div style="font-size:22px; margin-bottom:2px;">🎉</div>
              <div style="font-size:14px; font-weight:700; color:#4ade80; margin-bottom:2px;">Payment Confirmed!</div>
              <div style="font-size:12px; color:#d1d5db;" id="tournamaxZetpaySuccessMsg">Hosting subscription renewed. Restoring access…</div>
            </div>
          </div>

          <!-- SECONDARY / FALLBACK OPTION: Manual UPI & UTR Submission -->
          <div style="text-align:center; margin-top:8px;">
            <button type="button" id="btnTournamaxToggleManual" style="
              background:transparent; border:none; color:#9ca3af; font-size:11px; text-decoration:underline; cursor:pointer; padding:4px 6px;
            ">Or pay manually via UPI reference (UTR) ▼</button>
          </div>

          <div id="tournamaxManualUtrBox" style="display:none; margin-top:12px; padding-top:12px; border-top:1px dashed #272d3d; text-align:left;">
            <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:14px; margin-bottom:12px;">
              <div style="background:#fff; padding:5px; border-radius:6px; display:inline-block;">
                <img src="${qrUrl}" alt="Scan to Pay ₹${amount}" style="width:120px; height:120px; display:block;" />
              </div>
              <div style="flex:1; min-width:170px;">
                <div style="font-size:11px; color:#9ca3af; margin-bottom:4px;">Platform UPI VPA:</div>
                <div style="display:flex; gap:4px; margin-bottom:8px;">
                  <input type="text" id="tournamaxUpiVpaInput" value="${upiId}" readonly style="
                    background:#000; border:1px solid #374151; color:#f3f4f6; font-family:monospace; font-size:12px; padding:6px 8px; border-radius:6px; flex:1;
                  " />
                  <button type="button" id="btnTournamaxCopyVpa" style="
                    background:#374151; border:none; color:#f3f4f6; font-size:11px; padding:6px 10px; border-radius:6px; cursor:pointer;
                  ">Copy</button>
                </div>
                <a href="${upiUri}" style="
                  display:block; text-align:center; background:#ea580c; color:#fff; font-size:11px; font-weight:600; padding:7px 10px; border-radius:6px; text-decoration:none;
                ">⚡ Open Any UPI App</a>
              </div>
            </div>

            <label style="display:block; font-size:11px; color:#d1d5db; margin-bottom:4px; font-weight:600;">
              Enter 12-Digit Transaction Reference (UTR):
            </label>
            <div style="display:flex; gap:6px;">
              <input type="text" id="tournamaxUtrInput" placeholder="e.g. 429812345678" maxlength="30" style="
                background:#000; border:1px solid #374151; color:#fff; font-family:monospace; font-size:12px; padding:7px 10px; border-radius:6px; flex:1;
              " />
              <button type="button" id="btnTournamaxSubmitUtr" style="
                background:#22c55e; border:none; color:#fff; font-weight:600; font-size:12px; padding:7px 12px; border-radius:6px; cursor:pointer; white-space:nowrap;
              ">Submit Proof</button>
            </div>
            <div id="tournamaxUtrMsg" style="display:none; font-size:11px; margin-top:8px; padding:6px 10px; border-radius:6px;"></div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#6b7280;">Tenant: <code>${tenantSlug}</code></span>
          <button type="button" id="btnTournamaxPollStatus" style="
            background:transparent; border:1px solid #374151; color:#9ca3af; font-size:11px; padding:5px 10px; border-radius:6px; cursor:pointer;
          ">🔄 Refresh Status</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    lockOverlayEl = overlay;

    // Attach ZetPay checkout handler
    let activePaymentUrl = null;
    let activeOrderCode = null;

    const btnPayZetpay = document.getElementById('btnTournamaxPayZetpay');
    const zetpayInitialBox = document.getElementById('tournamaxZetpayInitialBox');
    const zetpayPollingBox = document.getElementById('tournamaxZetpayPollingBox');
    const zetpaySuccessBox = document.getElementById('tournamaxZetpaySuccessBox');
    const zetpayErrorMsg = document.getElementById('tournamaxZetpayErrorMsg');
    const pollingStatusText = document.getElementById('tournamaxPollingStatusText');

    btnPayZetpay?.addEventListener('click', async () => {
      if (btnPayZetpay.disabled) return;
      btnPayZetpay.disabled = true;
      btnPayZetpay.innerHTML = 'Connecting to ZetPay…';
      if (zetpayErrorMsg) zetpayErrorMsg.style.display = 'none';

      try {
        const res = await fetch('/api/v1/subscription/zetpay/start?tenant=' + encodeURIComponent(tenantSlug), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenant: tenantSlug })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to initialize ZetPay order.');
        }

        activePaymentUrl = data.paymentUrl;
        activeOrderCode = data.orderCode;

        // Open payment in popup or new tab
        const width = 430;
        const height = 700;
        const left = Math.max(0, (window.screen.width - width) / 2);
        const top = Math.max(0, (window.screen.height - height) / 2);
        let win = window.open(
          activePaymentUrl,
          'ZetPayRenewalPopup',
          `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
        );
        if (!win || win.closed || typeof win.closed === 'undefined') {
          window.open(activePaymentUrl, '_blank');
        }

        // Switch to polling view
        if (zetpayInitialBox) zetpayInitialBox.style.display = 'none';
        if (zetpayPollingBox) zetpayPollingBox.style.display = 'block';

        startZetpayPolling(activeOrderCode);

      } catch (err) {
        if (zetpayErrorMsg) {
          zetpayErrorMsg.textContent = err.message || 'Payment initiation failed.';
          zetpayErrorMsg.style.display = 'block';
        }
        btnPayZetpay.disabled = false;
        btnPayZetpay.innerHTML = `⚡ Pay ₹${amount} with ZetPay (Instant UPI)`;
      }
    });

    document.getElementById('btnTournamaxReopenPayment')?.addEventListener('click', () => {
      if (activePaymentUrl) {
        window.open(activePaymentUrl, '_blank');
      }
    });

    document.getElementById('btnTournamaxCheckNow')?.addEventListener('click', () => {
      if (activeOrderCode) {
        checkZetpayStatusOnce(activeOrderCode, true);
      }
    });

    function startZetpayPolling(orderCode) {
      if (zetpayPollInterval) clearInterval(zetpayPollInterval);
      let pollCount = 0;

      const poll = async () => {
        pollCount += 1;
        await checkZetpayStatusOnce(orderCode, false, pollCount);
      };

      // Check immediately, then every 3 seconds
      poll();
      zetpayPollInterval = setInterval(poll, 3000);
    }

    async function checkZetpayStatusOnce(orderCode, manual = false, count = 1) {
      try {
        if (pollingStatusText) {
          pollingStatusText.textContent = manual
            ? 'Checking confirmation with ZetPay…'
            : `Checking status with ZetPay… (Check #${count})`;
        }

        const res = await fetch(`/api/v1/subscription/zetpay/status?tenant=${encodeURIComponent(tenantSlug)}&code=${encodeURIComponent(orderCode)}`, {
          cache: 'no-store'
        });
        const data = await res.json();

        if (data && data.status === 'success') {
          if (zetpayPollInterval) clearInterval(zetpayPollInterval);
          zetpayPollInterval = null;

          if (zetpayPollingBox) zetpayPollingBox.style.display = 'none';
          if (zetpaySuccessBox) {
            zetpaySuccessBox.style.display = 'block';
            const msgEl = document.getElementById('tournamaxZetpaySuccessMsg');
            if (msgEl && data.message) msgEl.textContent = data.message;
          }

          // Automatically unlock and refresh after short celebratory delay
          setTimeout(async () => {
            removeLockScreen();
            await checkSubscription();
            if (typeof window.loadSubscriptionSection === 'function') {
              window.loadSubscriptionSection();
            }
          }, 1800);

        } else if (data && data.status === 'failed') {
          if (zetpayPollInterval) clearInterval(zetpayPollInterval);
          zetpayPollInterval = null;
          if (pollingStatusText) {
            pollingStatusText.style.color = '#f87171';
            pollingStatusText.textContent = data.message || 'ZetPay reported payment was cancelled or failed.';
          }
          if (btnPayZetpay) {
            btnPayZetpay.disabled = false;
            btnPayZetpay.innerHTML = `⚡ Retry ZetPay Payment (₹${amount})`;
          }
          if (zetpayInitialBox) zetpayInitialBox.style.display = 'block';
        }
      } catch (pollErr) {
        console.warn('Status poll warning:', pollErr);
      }
    }

    // Toggle Manual UTR Section
    document.getElementById('btnTournamaxToggleManual')?.addEventListener('click', () => {
      const manualBox = document.getElementById('tournamaxManualUtrBox');
      const toggleBtn = document.getElementById('btnTournamaxToggleManual');
      if (manualBox) {
        const isHidden = manualBox.style.display === 'none';
        manualBox.style.display = isHidden ? 'block' : 'none';
        if (toggleBtn) {
          toggleBtn.textContent = isHidden
            ? '▲ Hide manual UPI submission'
            : 'Or pay manually via UPI reference (UTR) ▼';
        }
      }
    });

    // Handle Copy UPI
    document.getElementById('btnTournamaxCopyVpa')?.addEventListener('click', () => {
      navigator.clipboard.writeText(upiId).then(() => {
        alert('Copied UPI ID: ' + upiId);
      }).catch(() => {
        prompt('Copy UPI ID:', upiId);
      });
    });

    // Handle Manual UTR Submit
    document.getElementById('btnTournamaxSubmitUtr')?.addEventListener('click', async () => {
      const utrEl = document.getElementById('tournamaxUtrInput');
      const msgEl = document.getElementById('tournamaxUtrMsg');
      const btn = document.getElementById('btnTournamaxSubmitUtr');
      const utr = utrEl ? utrEl.value.trim() : '';

      if (!utr || utr.length < 6) {
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.style.background = 'rgba(239, 68, 68, 0.2)';
          msgEl.style.color = '#f87171';
          msgEl.textContent = 'Please enter a valid 12-digit UPI UTR number.';
        }
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Submitting...';
      }

      try {
        const res = await fetch('/api/v1/subscription/submit-proof?tenant=' + encodeURIComponent(tenantSlug), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ utr: utr, plan_id: 1 })
        });
        const resJson = await res.json();
        if (!res.ok) throw new Error(resJson?.error || 'Failed to submit payment proof.');

        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.style.background = 'rgba(34, 197, 94, 0.2)';
          msgEl.style.color = '#4ade80';
          msgEl.textContent = '✅ Payment submitted! Main Admin will verify your UTR and activate your hosting shortly.';
        }
        if (utrEl) utrEl.value = '';
      } catch (err) {
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.style.background = 'rgba(239, 68, 68, 0.2)';
          msgEl.style.color = '#f87171';
          msgEl.textContent = err.message || 'Submission failed.';
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Submit Proof';
        }
      }
    });

    // Handle Manual Status Refresh
    document.getElementById('btnTournamaxPollStatus')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnTournamaxPollStatus');
      if (btn) btn.textContent = 'Checking…';
      await checkSubscription();
      if (btn) btn.textContent = '🔄 Refresh Status';
    });
  }

  function removeLockScreen() {
    if (zetpayPollInterval) {
      clearInterval(zetpayPollInterval);
      zetpayPollInterval = null;
    }
    if (lockOverlayEl && lockOverlayEl.parentNode) {
      lockOverlayEl.parentNode.removeChild(lockOverlayEl);
      lockOverlayEl = null;
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
  }

  /* ==============================================================
     TOURNAMENT USER APK ENFORCEMENT RULES (DELAYED LOCK)
     ============================================================== */
  function handleUserRules(sub) {
    if (isDemoApp() || sub.is_demo) {
      removeUserLockScreen();
      return;
    }
    if (sub.user_locked) {
      showUserLockScreen(sub);
    } else {
      removeUserLockScreen();
    }
  }

  let userLockOverlayEl = null;

  function showUserLockScreen(sub) {
    if (isDemoApp() || sub.is_demo) {
      removeUserLockScreen();
      return;
    }
    if (document.getElementById('tournamax-user-lock-screen')) return;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.id = 'tournamax-user-lock-screen';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100vw;
      height: 100vh;
      background: #090b10;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: 'Poppins', -apple-system, sans-serif;
      box-sizing: border-box;
      text-align: center;
      color: #f3f4f6;
    `;

    overlay.innerHTML = `
      <div style="max-width: 440px; width: 100%;">
        <div style="
          width: 80px;
          height: 80px;
          margin: 0 auto 20px;
          background: rgba(255, 85, 0, 0.12);
          border: 1px solid rgba(255, 85, 0, 0.35);
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 38px;
          box-shadow: 0 0 25px rgba(255, 85, 0, 0.2);
        ">🎮</div>

        <div style="
          display: inline-block;
          background: rgba(255, 85, 0, 0.15);
          border: 1px solid rgba(255, 85, 0, 0.4);
          color: #ff5500;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          padding: 4px 12px;
          border-radius: 20px;
          margin-bottom: 12px;
        ">SCHEDULED MAINTENANCE</div>

        <h1 style="
          font-size: 28px;
          font-weight: 800;
          color: #ffffff;
          margin: 0 0 12px;
          letter-spacing: -0.5px;
        ">Coming Back Soon</h1>

        <p style="
          color: #9ca3af;
          font-size: 14px;
          line-height: 1.6;
          margin: 0 0 24px;
        ">
          ${sub.user_lock_submessage || 'This tournament app is currently undergoing server maintenance & subscription renewal. Tournaments, squads, and live matches will resume shortly!'}
        </p>

        <div style="
          padding: 12px 16px;
          background: #12151e;
          border: 1px solid #1f2533;
          border-radius: 10px;
          font-size: 12px;
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;"></span>
          Auto-restoring upon organizer renewal
        </div>

        <button type="button" id="btnTournamaxUserRefresh" style="
          margin-top: 20px;
          background: transparent;
          border: 1px solid #374151;
          color: #9ca3af;
          font-size: 12px;
          padding: 8px 18px;
          border-radius: 8px;
          cursor: pointer;
        ">🔄 Refresh App</button>
      </div>
    `;

    document.body.appendChild(overlay);
    userLockOverlayEl = overlay;

    document.getElementById('btnTournamaxUserRefresh')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnTournamaxUserRefresh');
      if (btn) btn.textContent = 'Checking…';
      await checkSubscription();
      if (btn) btn.textContent = '🔄 Refresh App';
    });
  }

  function removeUserLockScreen() {
    if (userLockOverlayEl && userLockOverlayEl.parentNode) {
      userLockOverlayEl.parentNode.removeChild(userLockOverlayEl);
      userLockOverlayEl = null;
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
  }

  // 4. Initial check & Periodic Polling
  function initBridge() {
    ensureStyles();
    checkSubscription();
    // Poll every 30 seconds
    setInterval(checkSubscription, 30000);
    // Also check on window focus
    window.addEventListener('focus', checkSubscription);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBridge);
  } else {
    initBridge();
  }

  // Export to window for custom tournament script access
  window.TournamaxBridge = {
    tenant: tenantSlug,
    check: checkSubscription,
    getStatus: () => currentStatus,
    isDemo: isDemoApp,
    removeLock: removeLockScreen
  };

})();
