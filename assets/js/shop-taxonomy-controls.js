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
    createShopTaxonomyControls: createShopTaxonomyControls
  };
});
