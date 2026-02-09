(() => {
  const ROOT_SELECTOR = '[data-opc-root]';
  const DEBUG = false;

  const dbg = (...args) => {
    if (DEBUG) console.log('[OPC DEBUG]', ...args);
  };

  class OnePageCarSeat {
    constructor(root) {
      this.root = root;
      this.form = root.querySelector('.js-opc-form');
      if (!this.form) return;

      this.product = null;
      this.currentVariant = null;

      this.packOptionIndex = Number.isFinite(parseInt(root.dataset.packOptionIndex, 10))
        ? parseInt(root.dataset.packOptionIndex, 10)
        : -1;
      this.hasPackOption = root.dataset.hasPackOption === 'true' && this.packOptionIndex >= 0;
      this.currentPackValue = null;

      this.optionSelects = Array.from(root.querySelectorAll('[data-option-index]'));

      this.variantIdInput = root.querySelector('[data-variant-id-input]');
      this.priceEl = root.querySelector('[data-price]');
      this.compareEl = root.querySelector('[data-compare-price]');
      this.atcBtn = root.querySelector('[data-atc-btn]');

      this.heroPackCards = Array.from(root.querySelectorAll('[data-pack-card]'));
      this.packRadios = Array.from(root.querySelectorAll('[data-pack-radio]'));
      this.packPickButtons = Array.from(root.querySelectorAll('[data-pack-pick]'));

      this.offerCards = Array.from(root.querySelectorAll('[data-offer-card]'));

      this.mediaItems = Array.from(root.querySelectorAll('.opc-media-stage [data-media-id]'));
      this.mediaThumbs = Array.from(root.querySelectorAll('[data-media-thumb]'));

      this.submitMainBtns = Array.from(root.querySelectorAll('[data-submit-main]'));

      this.stickyBar = root.querySelector('[data-sticky-bar]');
      this.stickyPrice = root.querySelector('[data-sticky-price]');
      this.stickyPack = root.querySelector('[data-sticky-pack]');
      this.stickySubmit = root.querySelector('[data-sticky-submit]');

      this.heroEl = root.querySelector('[data-hero]');
      this.footerEl = document.querySelector('footer');

      this.heroInView = true;
      this.formInView = false;
      this.footerInView = false;

      this.init();
    }

    init() {
      this.parseProductData();

      this.bindVariantEvents();
      this.bindPackEvents();
      this.bindMediaEvents();
      this.bindSubmitMirrors();
      this.bindFormSubmitSafety();
      this.bindStickyVisibility();

      // Initialize from hidden variant id / selected options.
      this.currentVariant = this.resolveVariantSafe();
      this.refreshState();
    }

    parseProductData() {
      const jsonEl = this.root.querySelector('[data-product-json]');
      if (!jsonEl) return;

      try {
        this.product = JSON.parse(jsonEl.textContent || '{}');
      } catch (err) {
        console.warn('[OnePageCarSeat] Failed to parse product JSON', err);
        this.product = null;
      }
    }

    firstAvailableVariant() {
      if (!this.product || !Array.isArray(this.product.variants)) return null;
      return this.product.variants.find((v) => !!v.available) || null;
    }

    findVariantByOptions(optionsArray, requireAvailable = false) {
      if (!this.product || !Array.isArray(this.product.variants) || !Array.isArray(optionsArray)) return null;

      return (
        this.product.variants.find((v) => {
          if (!Array.isArray(v.options)) return false;
          const same = v.options.length === optionsArray.length && v.options.every((opt, idx) => opt === optionsArray[idx]);
          if (!same) return false;
          if (requireAvailable && !v.available) return false;
          return true;
        }) || null
      );
    }

    findClosestAvailableVariant(selectedOptions) {
      if (!this.product || !Array.isArray(this.product.variants)) return null;
      const available = this.product.variants.filter((v) => !!v.available);
      if (!available.length) return null;

      // Prefer same non-pack options first (if pack option exists)
      if (this.hasPackOption) {
        const sameNonPack = available.find((v) =>
          v.options.every((opt, idx) => idx === this.packOptionIndex || opt === selectedOptions[idx])
        );
        if (sameNonPack) return sameNonPack;
      }

      // Then any available variant sharing at least one selected option
      const partial = available.find((v) => v.options.some((opt, idx) => opt === selectedOptions[idx]));
      if (partial) return partial;

      return available[0];
    }

    getPackValueFromUI() {
      const checked = this.packRadios.find((r) => r.checked);
      if (checked && checked.value) return checked.value;

      if (this.stickyPack && this.stickyPack.value) return this.stickyPack.value;

      return this.currentPackValue;
    }

    applyPackUIValue(value) {
      if (!this.hasPackOption || !value) return;
      this.currentPackValue = value;

      this.packRadios.forEach((radio) => {
        radio.checked = radio.value === value;
      });

      this.heroPackCards.forEach((card) => {
        card.classList.toggle('is-active', card.dataset.packValue === value);
      });

      this.offerCards.forEach((card) => {
        card.classList.toggle('is-active', card.dataset.packValue === value);
      });

      if (this.stickyPack && this.stickyPack.value !== value) {
        this.stickyPack.value = value;
      }
    }

    collectSelectedOptions() {
      if (!this.product || !Array.isArray(this.product.options)) return [];

      const optionCount = this.product.options.length;
      const selected = new Array(optionCount);

      // Fill from explicit option selects rendered in DOM
      this.optionSelects.forEach((select) => {
        const idx = parseInt(select.dataset.optionIndex, 10);
        if (Number.isFinite(idx) && idx >= 0 && idx < optionCount) {
          selected[idx] = select.value;
        }
      });

      // Fill pack option from pack UI controls
      if (this.hasPackOption && this.packOptionIndex < optionCount) {
        const packValue = this.getPackValueFromUI();
        if (packValue) selected[this.packOptionIndex] = packValue;
      }

      // Fill gaps from current variant
      const current = this.currentVariant && Array.isArray(this.currentVariant.options) ? this.currentVariant.options : null;
      if (current) {
        for (let i = 0; i < optionCount; i += 1) {
          if (typeof selected[i] === 'undefined') selected[i] = current[i];
        }
      }

      // Final fallback from first variant
      const first = this.product.variants && this.product.variants[0] ? this.product.variants[0].options : null;
      if (first) {
        for (let i = 0; i < optionCount; i += 1) {
          if (typeof selected[i] === 'undefined') selected[i] = first[i];
        }
      }

      return selected;
    }

    syncUIToVariant(variant) {
      if (!variant || !Array.isArray(variant.options)) return;

      // Sync all rendered option selects (non-pack selects in this section)
      this.optionSelects.forEach((select) => {
        const idx = parseInt(select.dataset.optionIndex, 10);
        if (!Number.isFinite(idx)) return;
        const desired = variant.options[idx];
        if (typeof desired !== 'undefined' && select.value !== desired) {
          select.value = desired;
        }
      });

      // Sync pack UI from variant option value
      if (this.hasPackOption) {
        const packValue = variant.options[this.packOptionIndex];
        if (packValue) this.applyPackUIValue(packValue);
      }
    }

    resolveVariantSafe() {
      if (!this.product || !Array.isArray(this.product.variants) || !this.product.variants.length) {
        return null;
      }

      const selected = this.collectSelectedOptions();
      dbg('selected options', selected);

      // 1) exact match first (available or unavailable)
      let variant = this.findVariantByOptions(selected, false);

      // 2) fallback to closest available
      if (!variant) {
        variant = this.findClosestAvailableVariant(selected);
      }

      // 3) global fallback
      if (!variant) {
        variant = this.firstAvailableVariant() || this.product.variants[0] || null;
      }

      if (variant) {
        this.syncUIToVariant(variant);
        dbg('resolved variant id', variant.id, variant.options);
      }

      return variant;
    }

    choosePackValue(packValue, opts = {}) {
      if (!this.hasPackOption || !packValue) return;

      this.applyPackUIValue(packValue);
      this.currentVariant = this.resolveVariantSafe();
      this.refreshState();

      if (opts.focusForm) {
        this.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    updatePriceUI(variant) {
      const priceCents = parseInt(variant?.price || 0, 10) || 0;
      const compareCents = parseInt(variant?.compare_at_price || 0, 10) || 0;
      const showCompare = compareCents > priceCents && compareCents > 0;

      if (this.priceEl) this.priceEl.textContent = this.formatMoney(priceCents);

      if (this.compareEl) {
        if (showCompare) {
          this.compareEl.textContent = this.formatMoney(compareCents);
          this.compareEl.classList.remove('is-hidden');
        } else {
          this.compareEl.textContent = '';
          this.compareEl.classList.add('is-hidden');
        }
      }

      if (this.stickyPrice) {
        this.stickyPrice.textContent = this.formatMoney(priceCents);
      }

      dbg('rendered price', { priceCents, compareCents, showCompare });
    }

    updateAvailabilityUI(isAvailable) {
      const available = !!isAvailable;

      const atcDefault = this.atcBtn?.dataset.defaultText || 'Add to cart';
      const atcSold = this.atcBtn?.dataset.soldoutText || 'Sold out';

      if (this.atcBtn) {
        this.atcBtn.disabled = !available;
        this.atcBtn.textContent = available ? atcDefault : atcSold;
      }

      if (this.stickySubmit) {
        const stickyDefault = this.stickySubmit.dataset.defaultText || 'Add to cart';
        const stickySold = this.stickySubmit.dataset.soldoutText || 'Sold out';
        this.stickySubmit.disabled = !available;
        this.stickySubmit.textContent = available ? stickyDefault : stickySold;
      }
    }

    findVariantForPackValue(packValue) {
      if (!this.product || !Array.isArray(this.product.variants)) return null;
      if (!this.hasPackOption) return this.currentVariant;

      const selected = this.collectSelectedOptions();
      selected[this.packOptionIndex] = packValue;
      return this.findVariantByOptions(selected, false);
    }

    updateOfferCards() {
      if (!this.offerCards.length) return;

      this.offerCards.forEach((card) => {
        const packValue = card.dataset.packValue;
        const variant = this.findVariantForPackValue(packValue);

        const priceEl = card.querySelector('[data-offer-price]');
        const compareEl = card.querySelector('[data-offer-compare]');
        const button = card.querySelector('[data-pack-pick]');

        if (variant) {
          const priceCents = parseInt(variant.price || 0, 10) || 0;
          const compareCents = parseInt(variant.compare_at_price || 0, 10) || 0;
          const showCompare = compareCents > priceCents && compareCents > 0;

          if (priceEl) priceEl.textContent = this.formatMoney(priceCents);

          if (compareEl) {
            if (showCompare) {
              compareEl.textContent = this.formatMoney(compareCents);
              compareEl.classList.remove('is-hidden');
            } else {
              compareEl.textContent = '';
              compareEl.classList.add('is-hidden');
            }
          }

          const unavailable = !variant.available;
          card.classList.toggle('is-unavailable', unavailable);

          if (button) {
            const defaultLabel = button.dataset.defaultLabel || `Select ${packValue}`;
            button.disabled = unavailable;
            button.textContent = unavailable ? 'Unavailable' : defaultLabel;
          }
        } else {
          card.classList.add('is-unavailable');
          if (priceEl) priceEl.textContent = '—';
          if (compareEl) {
            compareEl.textContent = '';
            compareEl.classList.add('is-hidden');
          }
          if (button) {
            button.disabled = true;
            button.textContent = 'Unavailable';
          }
        }

        card.classList.toggle('is-active', packValue === this.currentPackValue);
      });
    }

    updatePackCardsAvailability() {
      if (!this.heroPackCards.length) return;

      this.heroPackCards.forEach((card) => {
        const packValue = card.dataset.packValue;
        const variant = this.findVariantForPackValue(packValue);
        const unavailable = !variant || !variant.available;

        card.classList.toggle('is-unavailable', unavailable);

        const radio = card.querySelector('[data-pack-radio]');
        if (radio) {
          radio.disabled = unavailable;
        }
      });
    }

    syncMediaToVariant(variant) {
      if (!variant) return;

      const featuredMediaId = variant.featured_media?.id || variant.featured_image?.id || null;
      if (featuredMediaId) {
        this.setActiveMedia(String(featuredMediaId));
      }
    }

    setActiveMedia(mediaId) {
      if (!mediaId) return;

      this.mediaItems.forEach((item) => {
        const active = String(item.dataset.mediaId) === String(mediaId);
        item.classList.toggle('is-active', active);

        if (active) {
          item.removeAttribute('hidden');
        } else {
          item.setAttribute('hidden', 'hidden');
          const video = item.querySelector('video');
          if (video && !video.paused) video.pause();
        }
      });

      this.mediaThumbs.forEach((thumb) => {
        const active = String(thumb.dataset.mediaId) === String(mediaId);
        thumb.classList.toggle('is-active', active);
      });
    }

    refreshState() {
      const variant = this.currentVariant || this.resolveVariantSafe();
      if (!variant) {
        this.updateAvailabilityUI(false);
        return;
      }

      this.currentVariant = variant;

      if (this.variantIdInput) {
        this.variantIdInput.value = String(variant.id);
      }

      // Ensure pack UI remains synchronized to resolved variant
      if (this.hasPackOption && Array.isArray(variant.options)) {
        const packValue = variant.options[this.packOptionIndex];
        if (packValue) this.applyPackUIValue(packValue);
      }

      this.updatePriceUI(variant);
      this.updateAvailabilityUI(variant.available);
      this.syncMediaToVariant(variant);
      this.updateOfferCards();
      this.updatePackCardsAvailability();
    }

    bindVariantEvents() {
      this.optionSelects.forEach((select) => {
        select.addEventListener('change', () => {
          this.currentVariant = this.resolveVariantSafe();
          this.refreshState();
        });
      });
    }

    bindPackEvents() {
      this.packRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked) this.choosePackValue(radio.value);
        });
      });

      this.packPickButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const packValue = btn.dataset.packPick;
          this.choosePackValue(packValue, { focusForm: true });
        });
      });

      // Card click safety (label/article click edges)
      this.root.addEventListener('click', (e) => {
        const card = e.target.closest('[data-pack-card]');
        if (!card || !this.root.contains(card)) return;
        const value = card.dataset.packValue;
        if (value) this.choosePackValue(value);
      });

      if (this.stickyPack) {
        this.stickyPack.addEventListener('change', () => {
          this.choosePackValue(this.stickyPack.value);
        });
      }
    }

    bindMediaEvents() {
      this.mediaThumbs.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mediaId = btn.dataset.mediaId;
          if (mediaId) this.setActiveMedia(mediaId);
        });
      });
    }

    bindSubmitMirrors() {
      this.submitMainBtns.forEach((btn) => {
        btn.addEventListener('click', () => this.submitMainForm());
      });

      if (this.stickySubmit) {
        this.stickySubmit.addEventListener('click', () => this.submitMainForm());
      }
    }

    bindFormSubmitSafety() {
      this.form.addEventListener('submit', (e) => {
        const safeVariant = this.resolveVariantSafe();

        if (!safeVariant || !safeVariant.available) {
          e.preventDefault();
          this.updateAvailabilityUI(false);
          return;
        }

        if (this.variantIdInput) {
          this.variantIdInput.value = String(safeVariant.id);
        }

        dbg('ATC payload id', this.variantIdInput?.value);
      });
    }

    submitMainForm() {
      if (!this.form) return;
      if (typeof this.form.requestSubmit === 'function') {
        this.form.requestSubmit();
      } else {
        this.form.submit();
      }
    }

    bindStickyVisibility() {
      if (!this.stickyBar || !this.heroEl || !this.form) return;

      const update = () => {
        const mobile = window.matchMedia('(max-width: 989px)').matches;
        const show = mobile && !this.heroInView && !this.formInView && !this.footerInView;

        this.stickyBar.classList.toggle('is-visible', show);
        this.stickyBar.setAttribute('aria-hidden', show ? 'false' : 'true');
      };

      if ('IntersectionObserver' in window) {
        const heroObserver = new IntersectionObserver(
          (entries) => {
            this.heroInView = entries[0]?.isIntersecting ?? true;
            update();
          },
          { threshold: 0.1 }
        );
        heroObserver.observe(this.heroEl);

        const formObserver = new IntersectionObserver(
          (entries) => {
            this.formInView = entries[0]?.isIntersecting ?? false;
            update();
          },
          { threshold: 0.2 }
        );
        formObserver.observe(this.form);

        if (this.footerEl) {
          const footerObserver = new IntersectionObserver(
            (entries) => {
              this.footerInView = entries[0]?.isIntersecting ?? false;
              update();
            },
            { threshold: 0.01 }
          );
          footerObserver.observe(this.footerEl);
        }
      } else {
        const onScroll = () => {
          this.heroInView = this.heroEl.getBoundingClientRect().bottom > 20;
          this.formInView =
            this.form.getBoundingClientRect().top < window.innerHeight * 0.75 &&
            this.form.getBoundingClientRect().bottom > 80;
          this.footerInView = this.footerEl
            ? this.footerEl.getBoundingClientRect().top < window.innerHeight
            : false;
          update();
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
      }

      window.addEventListener('resize', update);
      update();
    }

    formatMoney(cents) {
      const safeCents = Number.isFinite(parseInt(cents, 10)) ? parseInt(cents, 10) : 0;
      const currencyCode = this.root.dataset.currencyCode || 'USD';

      if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
        try {
          const format = window.Shopify.money_format || '${{amount}}';
          return window.Shopify.formatMoney(safeCents, format);
        } catch (e) {
          // fall through
        }
      }

      try {
        return new Intl.NumberFormat(document.documentElement.lang || 'en-US', {
          style: 'currency',
          currency: currencyCode
        }).format(safeCents / 100);
      } catch (e) {
        return `$${(safeCents / 100).toFixed(2)}`;
      }
    }
  }

  function boot(scope = document) {
    const roots = scope.matches?.(ROOT_SELECTOR)
      ? [scope]
      : Array.from(scope.querySelectorAll(ROOT_SELECTOR));

    roots.forEach((root) => {
      if (root.__opcInstance) return;
      root.__opcInstance = new OnePageCarSeat(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(document));
  } else {
    boot(document);
  }

  document.addEventListener('shopify:section:load', (event) => {
    boot(event.target);
  });
})();
