(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.BassBingeShopTaxonomyControls = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DEPARTMENT_LABELS = {
    fishing: 'Fishing',
    'lifestyle-and-gear': 'Lifestyle & Gear'
  };

  function createShopFilterPanel(options) {
    var document = options.document;
    var toggle = document.querySelector('[data-shop-filters-toggle]');
    var panel = document.querySelector('[data-shop-filters-panel]');
    var shopTools = document.querySelector('.shop-tools');

    if (!toggle || !panel || !shopTools) return null;

    function setOpen(open) {
      toggle.setAttribute('aria-controls', panel.id);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Hide filters' : 'Filters';
      panel.setAttribute('aria-hidden', String(!open));
      if (open) panel.removeAttribute('inert');
      else panel.setAttribute('inert', '');
      shopTools.classList.toggle('filters-open', open);
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
      setOpen(false);
      if (typeof toggle.focus === 'function') toggle.focus();
    });

    setOpen(false);

    return {
      close: function () { setOpen(false); },
      open: function () { setOpen(true); }
    };
  }

  function createShopRelevantFilters(options) {
    var document = options.document;
    var onReset = typeof options.onReset === 'function' ? options.onReset : function () {};
    var controls = Array.from(document.querySelectorAll('[data-shop-filter-control]'));

    function sync(selection, products) {
      var activeProducts = Array.isArray(products) ? products : [];
      var prices = activeProducts.map(function (product) { return Number(product.price); });
      var underMatches = prices.some(function (price) { return price < 5.25; });
      var underExcludes = prices.some(function (price) { return price >= 5.25; });
      var fiveMatches = prices.some(function (price) { return price === 5; });
      var fiveExcludes = prices.some(function (price) { return price !== 5; });

      var relevant = {
        'jig-profile': selection.subcategory === 'jigs',
        color: activeProducts.some(function (product) { return product.hasColor; }),
        price: (underMatches && underExcludes) || (fiveMatches && fiveExcludes),
        availability: activeProducts.some(function (product) { return !product.checkoutReady; }),
        size: selection.subcategory === 'apparel' && activeProducts.some(function (product) { return product.hasSize; })
      };
      var visible = [];

      controls.forEach(function (control) {
        var name = control.dataset.shopFilterControl;
        var isRelevant = Boolean(relevant[name]);
        control.hidden = !isRelevant;
        if (isRelevant) visible.push(name);
        else onReset(name);
      });

      return visible;
    }

    return { sync: sync };
  }

  function createShopTaxonomyControls(options) {
    var document = options.document;
    var taxonomy = options.taxonomy;
    var onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    var departmentButtons = Array.from(document.querySelectorAll('[data-shop-department-button]'));
    var subcategoryButtons = Array.from(document.querySelectorAll('[data-shop-subcategory]'));
    var subcategoryGroup = document.querySelector('[data-shop-subcategory-controls]');
    var department = taxonomy.departments.includes(options.initialDepartment)
      ? options.initialDepartment
      : 'fishing';
    var subcategory = taxonomy.subcategories.includes(options.initialSubcategory)
      ? options.initialSubcategory
      : null;

    if (subcategory && taxonomy.departmentForProduct({ subcategory: subcategory }) !== department) {
      subcategory = null;
    }

    function selection() {
      return { department: department, subcategory: subcategory };
    }

    function sync() {
      departmentButtons.forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.dataset.shopDepartment === department));
      });
      subcategoryButtons.forEach(function (button) {
        var belongsToDepartment = button.dataset.shopDepartment === department;
        button.hidden = !belongsToDepartment;
        button.setAttribute('aria-pressed', String(
          belongsToDepartment && button.dataset.shopSubcategory === subcategory
        ));
      });
      if (subcategoryGroup) {
        subcategoryGroup.setAttribute('aria-label', DEPARTMENT_LABELS[department] + ' subcategories');
      }
      document.body.dataset.shopActiveDepartment = department;
      document.body.dataset.shopActiveSubcategory = subcategory || '';
    }

    function matchesProduct(product) {
      var classification = taxonomy.classificationForProduct(product);
      return classification.department === department &&
        (!subcategory || classification.subcategory === subcategory);
    }

    departmentButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        department = button.dataset.shopDepartment;
        subcategory = null;
        sync();
        onChange(selection());
      });
    });

    subcategoryButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        subcategory = subcategory === button.dataset.shopSubcategory
          ? null
          : button.dataset.shopSubcategory;
        sync();
        onChange(selection());
      });
    });

    sync();

    return {
      getSelection: selection,
      matchesProduct: matchesProduct
    };
  }

  return {
    createShopFilterPanel: createShopFilterPanel,
    createShopRelevantFilters: createShopRelevantFilters,
    createShopTaxonomyControls: createShopTaxonomyControls
  };
});
