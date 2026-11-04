/**
 * Tournamax SaaS Platform Compatibility & Subscription Enforcement Bridge
 * Handles real-time synchronization, warning popups, and non-dismissible locks
 * across both the Tournament Admin APK and Tournament User APK.
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

  let currentStatus = null;
  let lockOverlayEl = null;
  let warningBannerEl = null;

  // 2. Fetch Subscription Status from Backend
  async function checkSubscription() {
    try {
      const res = await fetch('/api/v1/subscription/status?tenant=' + encodeURIComponent(tenantSlug), {
        cache: 'no-store'
      });
      if (!res.ok) return;
      const json = await res.json();
      if (!json || !json.data) return;
      currentStatus = json.data;
      applySubscriptionRules(json.data);
    } catch (err) {
      console.warn('[Tournamax Bridge] Subscription sync check failed:', err);
    }
  }

  // 3. Apply Enforcement Rules
  function applySubscriptionRules(sub) {
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
    // A. EXPIRY LOCK: subscription is expired or tenant suspended
    if (sub.admin_locked) {
      // Remove any warning banner if lock is triggered
      removeWarningBanner();
      showAdminLockScreen(sub);
    } else {
      // Not locked - remove any lock overlay
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
    if (sessionStorage.getItem('tournamax_sub_warn_dismissed') === '1') {
      return;
    }
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
            Your tournament hosting renewal is due on <strong>${formattedExpiry}</strong>. The renewal fee is <strong>₹${sub.renewal_amount || 50}</strong>. Renew early to keep services uninterrupted.
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
            ">⚡ Renew Now (₹${sub.renewal_amount || 50})</button>
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
        // If there is a subscription link in nav, trigger it
        const subNav = document.querySelector('[data-section="subscription-section"], #nav-subscription');
        if (subNav) subNav.click();
      } else {
        showAdminLockScreen(sub, false); // Open renewal modal
      }
    });
  }

  function removeWarningBanner() {
    if (warningBannerEl && warningBannerEl.parentNode) {
      warningBannerEl.parentNode.removeChild(warningBannerEl);
      warningBannerEl = null;
    }
  }

  // Admin Expiry Lock Screen (Full-Screen, Non-Dismissible)
  function showAdminLockScreen(sub, isMandatory = true) {
    if (document.getElementById('tournamax-admin-lock-screen')) return;

    // Prevent background scrolling
    if (isMandatory) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    }

    const upiId = sub.upi_id || 'platform@upi';
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
          ${sub.lock_message || 'Your hosting subscription has expired. Management features are restricted until a ₹50 renewal payment is verified.'}
        </p>

        <div style="background:#0c0e15; border:1px solid #272d3d; border-radius:12px; padding:16px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #1e2433; font-size:13px;">
            <span style="color:#9ca3af;">Renewal Fee:</span>
            <strong style="color:#22c55e; font-size:16px;">₹${amount} <span style="font-size:11px;color:#9ca3af;">/ 30 Days</span></strong>
          </div>

          <!-- QR & Payment URI -->
          <div style="display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:16px; margin-bottom:14px;">
            <div style="background:#fff; padding:6px; border-radius:8px; display:inline-block;">
              <img src="${qrUrl}" alt="Scan to Pay ₹${amount}" style="width:140px; height:140px; display:block;" />
            </div>
            <div style="text-align:left; flex:1; min-width:180px;">
              <div style="font-size:11px; color:#9ca3af; margin-bottom:4px;">Platform UPI VPA:</div>
              <div style="display:flex; gap:4px; margin-bottom:10px;">
                <input type="text" id="tournamaxUpiVpaInput" value="${upiId}" readonly style="
                  background:#000; border:1px solid #374151; color:#f3f4f6; font-family:monospace; font-size:12px; padding:6px 8px; border-radius:6px; flex:1;
                " />
                <button type="button" id="btnTournamaxCopyVpa" style="
                  background:#374151; border:none; color:#f3f4f6; font-size:11px; padding:6px 10px; border-radius:6px; cursor:pointer;
                ">Copy</button>
              </div>
              <a href="${upiUri}" style="
                display:block; text-align:center; background:#ff5500; color:#fff; font-size:12px; font-weight:600; padding:8px 12px; border-radius:6px; text-decoration:none;
              ">⚡ Open Any UPI App</a>
            </div>
          </div>

          <!-- Submit UTR Form -->
          <div style="text-align:left;">
            <label style="display:block; font-size:11px; color:#d1d5db; margin-bottom:4px; font-weight:600;">
              Enter 12-Digit Transaction Reference (UTR):
            </label>
            <div style="display:flex; gap:6px;">
              <input type="text" id="tournamaxUtrInput" placeholder="e.g. 429812345678" maxlength="30" style="
                background:#000; border:1px solid #374151; color:#fff; font-family:monospace; font-size:13px; padding:8px 10px; border-radius:6px; flex:1;
              " />
              <button type="button" id="btnTournamaxSubmitUtr" style="
                background:#22c55e; border:none; color:#fff; font-weight:600; font-size:12px; padding:8px 14px; border-radius:6px; cursor:pointer; white-space:nowrap;
              ">Submit Proof</button>
            </div>
            <div id="tournamaxUtrMsg" style="display:none; font-size:12px; margin-top:8px; padding:6px 10px; border-radius:6px;"></div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#6b7280;">Tenant: <code>${tenantSlug}</code></span>
          <button type="button" id="btnTournamaxPollStatus" style="
            background:transparent; border:1px solid #374151; color:#9ca3af; font-size:11px; padding:5px 10px; border-radius:6px; cursor:pointer;
          ">🔄 Check Status</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    lockOverlayEl = overlay;

    // Handle Copy UPI
    document.getElementById('btnTournamaxCopyVpa')?.addEventListener('click', () => {
      navigator.clipboard.writeText(upiId).then(() => {
        alert('Copied UPI ID: ' + upiId);
      }).catch(() => {
        prompt('Copy UPI ID:', upiId);
      });
    });

    // Handle UTR Submit
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

    // Handle Manual Status Check
    document.getElementById('btnTournamaxPollStatus')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnTournamaxPollStatus');
      if (btn) btn.textContent = 'Checking...';
      await checkSubscription();
      if (btn) btn.textContent = '🔄 Check Status';
    });
  }

  function removeLockScreen() {
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
    if (sub.user_locked) {
      showUserLockScreen(sub);
    } else {
      removeUserLockScreen();
    }
  }

  let userLockOverlayEl = null;

  function showUserLockScreen(sub) {
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
      if (btn) btn.textContent = 'Checking...';
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBridge);
  } else {
    initBridge();
  }

  function initBridge() {
    checkSubscription();
    // Poll every 30 seconds
    setInterval(checkSubscription, 30000);
    // Also check on window focus
    window.addEventListener('focus', checkSubscription);
  }

  // Export to window for custom tournament script access
  window.TournamaxBridge = {
    tenant: tenantSlug,
    check: checkSubscription,
    getStatus: () => currentStatus
  };

})();
