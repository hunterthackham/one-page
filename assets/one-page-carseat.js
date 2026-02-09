(() => {
  const ROOT_SELECTOR = '[data-opc-root]';

  class OnePageCarSeat {
    constructor(root) {
      this.root = root;
      this.form = root.querySelector('.js-opc-form');
      if (!this.form) return;

      this.product = null;
      this.currentVariant = null;
      this.currentPack = this.toInt(root.dataset.defaultPack, 2);
      this.packOptionIndex = null;
      this.packOptionValues = {};
      this.usesPackOption = false;

      this.optionSelects = Array.from(root.querySelectorAll('[data-option-index]'));
      this.variantIdInput = root.querySelector('[data-variant-id-input]');
      this.qtyInput = root.querySelector('[data-quantity-input]');
      this.priceEl = root.querySelector('[data-price]');
      this.compareEl = root.querySelector('[data-compare-price]');
      this.atcBtn = root.querySelector('[data-atc-btn]');
      this.heroEl = root.querySelector('[data-hero]');

      this.mediaItems = Array.from(root.querySelectorAll('[data-media-id]'));
      this.mediaThumbs = Array.from(root.querySelectorAll('[data-media-thumb]'));
      this.mediaPrev = root.querySelector('[data-media-prev]');
      this.mediaNext = root.querySelector('[data-media-next]');
      this.mediaOrder = [];
      this.activeMediaIndex = 0;

      this.packRadios = Array.from(root.querySelectorAll('[data-pack-radio]'));
      this.packPickButtons = Array.from(root.querySelectorAll('[data-pack-pick]'));
      this.packCards = Array.from(root.querySelectorAll('[data-pack-card]'));

      this.submitMainBtns = Array.from(root.querySelectorAll('[data-submit-main]'));

      this.stickyBar = root.querySelector('[data-sticky-bar]');
      this.stickyPrice = root.querySelector('[data-sticky-price]');
      this.stickyPack = root.querySelector('[data-sticky-pack]');
      this.stickySubmit = root.querySelector('[data-sticky-submit]');

      this.footerEl = document.querySelector('footer');

      this.heroInView = true;
      this.formInView = false;
      this.footerInView = false;

      this.init();
    }

    init() {
      this.parseProductData();
      this.resolvePackOption();
      this.bindVariantEvents();
      this.bindPackEvents();
      this.bindMediaEvents();
      this.bindSubmitMirrors();
      this.setPack(this.currentPack, { fromUI: false });

      const initialVariant = this.resolveVariant() || this.getVariantById(this.variantIdInput?.value);
      this.updateVariant(initialVariant);

      this.bindStickyBehavior();
    }

    parseProductData() {
      const jsonEl = this.root.querySelector('[data-product-json]');
      if (!jsonEl) return;

      try {
        this.product = JSON.parse(jsonEl.textContent);
      } catch (err) {
        console.warn('[OnePageCarSeat] Product JSON parse failed', err);
        this.product = null;
      }
    }

    resolvePackOption() {
      if (!this.product || !Array.isArray(this.product.options)) return;

      const packIndex = this.product.options.findIndex((option) =>
        String(option).toLowerCase().includes('pack')
      );

      if (packIndex === -1) return;

      this.packOptionIndex = packIndex;
      this.packOptionValues = {};

      this.product.variants.forEach((variant) => {
        if (!Array.isArray(variant.options)) return;
        const value = variant.options[packIndex];
        const packSize = this.parsePackSize(value);
        if (packSize && !this.packOptionValues[packSize]) {
          this.packOptionValues[packSize] = value;
        }
      });

      this.usesPackOption = Object.keys(this.packOptionValues).length > 0;
    }

    bindVariantEvents() {
      if (!this.optionSelects.length) return;

      this.optionSelects.forEach((select) => {
        select.addEventListener('change', () => {
          const variant = this.resolveVariant();
          this.updateVariant(variant);
        });
      });
    }

    bindPackEvents() {
      this.packRadios.forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked) {
            this.setPack(this.toInt(radio.value, 1), { fromUI: true });
          }
        });
      });

      this.packPickButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const qty = this.toInt(btn.dataset.packPick, this.currentPack || 1);
          this.setPack(qty, { fromUI: true, focusForm: true });
        });
      });

      if (this.stickyPack) {
        this.stickyPack.addEventListener('change', () => {
          this.setPack(this.toInt(this.stickyPack.value, this.currentPack || 1), { fromUI: true });
        });
      }
    }

    bindMediaEvents() {
      this.refreshMediaOrder();

      this.mediaThumbs.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mediaId = btn.dataset.mediaId;
          if (!mediaId) return;
          this.setActiveMedia(mediaId);
        });
      });

      if (this.mediaPrev) {
        this.mediaPrev.addEventListener('click', () => this.stepMedia(-1));
      }

      if (this.mediaNext) {
        this.mediaNext.addEventListener('click', () => this.stepMedia(1));
      }
    }

    bindSubmitMirrors() {
      this.submitMainBtns.forEach((btn) => {
        btn.addEventListener('click', () => this.submitMainForm());
      });

      if (this.stickySubmit) {
        this.stickySubmit.addEventListener('click', () => this.submitMainForm());
      }
    }

    bindStickyBehavior() {
      if (!this.stickyBar || !this.heroEl) return;

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
          const heroBottom = this.heroEl.getBoundingClientRect().bottom;
          this.heroInView = heroBottom > 20;
          this.formInView = this.form.getBoundingClientRect().top < window.innerHeight * 0.75 &&
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

    submitMainForm() {
      if (!this.form) return;
      if (typeof this.form.requestSubmit === 'function') {
        this.form.requestSubmit();
      } else {
        this.form.submit();
      }
    }

    setPack(qty, opts = {}) {
      const normalized = [1, 2, 4].includes(qty) ? qty : 1;
      this.currentPack = normalized;

      if (this.usesPackOption) {
        if (this.qtyInput) this.qtyInput.value = '1';
        const packValue = this.packOptionValues[normalized];
        if (packValue && this.optionSelects[this.packOptionIndex]) {
          this.optionSelects[this.packOptionIndex].value = packValue;
        }
      } else {
        if (this.qtyInput) this.qtyInput.value = String(normalized);
      }

      this.syncPackUi();

      if (this.usesPackOption) {
        const variant = this.resolveVariant();
        this.updateVariant(variant);
      } else if (this.currentVariant) {
        this.updatePriceCluster(this.currentVariant);
        this.updateOfferTotals(this.currentVariant);
      }

      if (opts.focusForm) {
        this.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    resolveVariant() {
      if (!this.product || !Array.isArray(this.product.variants) || this.product.variants.length === 0) {
        return null;
      }

      // Single variant flow
      if (!this.optionSelects.length) {
        const fromHidden = this.getVariantById(this.variantIdInput?.value);
        return fromHidden || this.firstAvailableVariant() || this.product.variants[0];
      }

      const selectedOptions = this.optionSelects.map((s) => s.value);
      let variant = this.product.variants.find((v) => {
        if (!Array.isArray(v.options)) return false;
        return v.options.every((opt, idx) => opt === selectedOptions[idx]);
      });

      if (!variant) {
        variant = this.firstAvailableVariant() || this.product.variants[0];
        if (variant && Array.isArray(variant.options)) {
          this.syncOptionSelectors(variant.options);
        }
      }

      return variant;
    }

    updateVariant(variant) {
      if (!variant) {
        this.setSoldOutState(true);
        return;
      }

      this.currentVariant = variant;
      this.syncPackToVariant(variant);

      if (this.variantIdInput) {
        this.variantIdInput.value = String(variant.id);
      }

      this.updatePriceCluster(variant);
      this.updateOfferTotals(variant);
      this.updateAvailability(variant);
      this.syncMediaToVariant(variant);
    }

    updatePriceCluster(variant) {
      const qty = this.currentPack || 1;
      const multiplier = this.usesPackOption ? 1 : qty;
      const priceCents = this.toInt(variant.price, 0) * multiplier;
      const compareCents = this.toInt(variant.compare_at_price, 0) * multiplier;
      const showCompare = compareCents > priceCents && compareCents > 0;

      if (this.priceEl) {
        this.priceEl.textContent = this.formatMoney(priceCents);
      }

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
    }

    updateOfferTotals(variant) {
      const priceNodes = this.root.querySelectorAll('[data-pack-total-price]');
      const compareNodes = this.root.querySelectorAll('[data-pack-total-compare]');

      priceNodes.forEach((node) => {
        const qty = this.toInt(node.dataset.packTotalPrice, 1);
        if (this.usesPackOption) {
          const packVariant = this.getVariantForPack(qty) || variant;
          node.textContent = this.formatMoney(this.toInt(packVariant.price, 0));
        } else {
          const cents = this.toInt(variant.price, 0) * qty;
          node.textContent = this.formatMoney(cents);
        }
      });

      compareNodes.forEach((node) => {
        const qty = this.toInt(node.dataset.packTotalCompare, 1);
        const packVariant = this.usesPackOption ? this.getVariantForPack(qty) || variant : variant;
        const multiplier = this.usesPackOption ? 1 : qty;
        const basePrice = this.toInt(packVariant.price, 0) * multiplier;
        const compare = this.toInt(packVariant.compare_at_price, 0) * multiplier;
        if (compare > basePrice && compare > 0) {
          node.textContent = this.formatMoney(compare);
          node.classList.remove('is-hidden');
        } else {
          node.textContent = '';
          node.classList.add('is-hidden');
        }
      });
    }

    updateAvailability(variant) {
      const soldOut = variant && typeof variant.available === 'boolean' ? !variant.available : false;

      this.setSoldOutState(soldOut);
    }

    setSoldOutState(soldOut) {
      const defaultAtc = this.atcBtn?.dataset.defaultText || 'Add to cart';
      const soldOutText = this.atcBtn?.dataset.soldoutText || 'Sold out';

      if (this.atcBtn) {
        this.atcBtn.disabled = soldOut;
        this.atcBtn.textContent = soldOut ? soldOutText : defaultAtc;
      }

      if (this.stickySubmit) {
        const stickyDefault = this.stickySubmit.dataset.defaultText || 'Add to cart';
        const stickySold = this.stickySubmit.dataset.soldoutText || 'Sold out';
        this.stickySubmit.disabled = soldOut;
        this.stickySubmit.textContent = soldOut ? stickySold : stickyDefault;
      }
    }

    syncMediaToVariant(variant) {
      if (!variant) return;
      const featuredMediaId =
        variant.featured_media?.id ||
        variant.featured_image?.id ||
        null;

      if (featuredMediaId) {
        this.setActiveMedia(String(featuredMediaId));
        return;
      }

      const featuredSrc = variant.featured_image?.src || variant.featured_image?.url;
      if (featuredSrc) {
        this.setActiveMediaBySrc(featuredSrc);
      }
    }

    setActiveMedia(mediaId) {
      if (!mediaId) return;

      this.mediaItems.forEach((item) => {
        const isActive = String(item.dataset.mediaId) === String(mediaId);
        item.classList.toggle('is-active', isActive);
        if (isActive) {
          item.removeAttribute('aria-hidden');
        } else {
          item.setAttribute('aria-hidden', 'true');
          const video = item.querySelector('video');
          if (video && !video.paused) video.pause();
        }
      });

      this.mediaThumbs.forEach((btn) => {
        const isActive = String(btn.dataset.mediaId) === String(mediaId);
        btn.classList.toggle('is-active', isActive);
      });
    }

    setActiveMediaBySrc(src) {
      const normalized = this.normalizeImageUrl(src);
      if (!normalized) return;

      const target = this.mediaItems.find((item) => {
        const candidate = item.dataset.mediaSrc;
        return candidate && this.normalizeImageUrl(candidate) === normalized;
      });

      if (target) {
        this.setActiveMedia(target.dataset.mediaId);
      }
    }

    syncOptionSelectors(optionValues) {
      if (!Array.isArray(optionValues)) return;
      this.optionSelects.forEach((select, idx) => {
        const value = optionValues[idx];
        if (typeof value === 'string' && select.value !== value) {
          select.value = value;
        }
      });
    }

    getVariantById(id) {
      const needle = String(id || '');
      if (!needle || !this.product || !Array.isArray(this.product.variants)) return null;
      return this.product.variants.find((v) => String(v.id) === needle) || null;
    }

    getVariantForPack(packSize) {
      if (!this.usesPackOption || !this.product || !Array.isArray(this.product.variants)) return null;
      const packValue = this.packOptionValues[packSize];
      if (!packValue) return null;

      let selections = this.optionSelects.map((select) => select.value);
      if (!selections.length && Array.isArray(this.currentVariant?.options)) {
        selections = [...this.currentVariant.options];
      }

      if (!selections.length) return null;

      selections[this.packOptionIndex] = packValue;

      return (
        this.product.variants.find((variant) => {
          if (!Array.isArray(variant.options)) return false;
          return variant.options.every((opt, idx) => opt === selections[idx]);
        }) || null
      );
    }

    firstAvailableVariant() {
      if (!this.product || !Array.isArray(this.product.variants)) return null;
      return this.product.variants.find((v) => !!v.available) || null;
    }

    toInt(value, fallback = 0) {
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    formatMoney(cents) {
      const safeCents = this.toInt(cents, 0);
      const currencyCode = this.root.dataset.currencyCode || 'USD';

      // Prefer Shopify formatter when available
      if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
        try {
          const format = window.Shopify.money_format || '${{amount}}';
          return window.Shopify.formatMoney(safeCents, format);
        } catch (e) {
          // Fall through to Intl formatter
        }
      }

      // Intl fallback
      try {
        return new Intl.NumberFormat(document.documentElement.lang || 'en-US', {
          style: 'currency',
          currency: currencyCode
        }).format(safeCents / 100);
      } catch (e) {
        return `$${(safeCents / 100).toFixed(2)}`;
      }
    }

    parsePackSize(value) {
      if (!value) return null;
      const match = String(value).match(/(^|\D)(1|2|4)(\D|$)/);
      if (!match) return null;
      return this.toInt(match[2], null);
    }

    syncPackToVariant(variant) {
      if (!this.usesPackOption || !variant || !Array.isArray(variant.options)) return;
      const packValue = variant.options[this.packOptionIndex];
      const packSize = this.parsePackSize(packValue);
      if (packSize && packSize !== this.currentPack) {
        this.currentPack = packSize;
        this.syncPackUi();
      }
    }

    syncPackUi() {
      if (this.usesPackOption && this.qtyInput) {
        this.qtyInput.value = '1';
      }

      this.packRadios.forEach((radio) => {
        radio.checked = this.toInt(radio.value, 0) === this.currentPack;
      });

      this.packCards.forEach((card) => {
        const cardQty = this.toInt(card.dataset.packCard, 0);
        card.classList.toggle('is-active', cardQty === this.currentPack);
      });

      if (this.stickyPack && this.stickyPack.value !== String(this.currentPack)) {
        this.stickyPack.value = String(this.currentPack);
      }
    }

    normalizeImageUrl(url) {
      if (!url) return '';
      return String(url)
        .split('?')[0]
        .replace(/_(\\d+x\\d+|\\d+x|\\d+)(?=\\.[a-z]+$)/i, '')
        .toLowerCase();
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

