import test from 'node:test';
import assert from 'node:assert/strict';
import { customerValidationSchema, INDIA_PIN_REGEX, POSTAL_REGEX } from '../src/pages/Customers/validation/customerValidation.js';

const addressSchema = customerValidationSchema.pick(['billingAddress', 'isShippingSameAsBilling', 'shippingAddress']);

const createBaseBilling = (overrides = {}) => ({
  street: '12 Main Road',
  addressLine2: 'Doddagubbi',
  city: 'Bangalore',
  state: 'Karnataka',
  postalCode: '560077',
  country: 'India',
  ...overrides,
});

test('Valid Indian address with 6-digit PIN code passes validation', () => {
  const result = addressSchema.validateSync({
    billingAddress: createBaseBilling({ country: 'India', postalCode: '560077' }),
    isShippingSameAsBilling: true,
  });
  assert.equal(result.billingAddress.country, 'India');
  assert.equal(result.billingAddress.postalCode, '560077');
});

test('Selecting a non-India country (e.g. Andorra) with an Indian PIN code (560077) fails country validation with consistency message', () => {
  assert.throws(
    () => {
      addressSchema.validateSync({
        billingAddress: createBaseBilling({ country: 'Andorra', postalCode: '560077' }),
        isShippingSameAsBilling: true,
      }, { abortEarly: false });
    },
    (err) => {
      const messages = err.errors || [];
      return messages.includes('Selected country is inconsistent with the entered PIN code.');
    }
  );
});

test('Selecting Andorra with Indian PIN code fails both country and postalCode consistency checks', () => {
  try {
    addressSchema.validateSync({
      billingAddress: createBaseBilling({ country: 'Andorra', postalCode: '560077' }),
      isShippingSameAsBilling: true,
    }, { abortEarly: false });
    assert.fail('Expected validation to throw');
  } catch (err) {
    const fieldErrors = (err.inner || []).map((e) => ({ path: e.path, message: e.message }));
    const countryErr = fieldErrors.find((e) => e.path === 'billingAddress.country');
    const postalErr = fieldErrors.find((e) => e.path === 'billingAddress.postalCode');

    assert.ok(countryErr, 'billingAddress.country should have an error');
    assert.equal(countryErr.message, 'Selected country is inconsistent with the entered PIN code.');
    assert.ok(postalErr, 'billingAddress.postalCode should have an error');
    assert.equal(postalErr.message, 'Selected country is inconsistent with the entered PIN code.');
  }
});

test('Selecting non-India countries (USA, Germany, Australia) with an Indian PIN code also reports inconsistency', () => {
  for (const country of ['United States', 'Germany', 'Australia', 'Andorra', 'UAE']) {
    try {
      addressSchema.validateSync({
        billingAddress: createBaseBilling({ country, postalCode: '560077' }),
        isShippingSameAsBilling: true,
      }, { abortEarly: false });
      assert.fail(`Expected validation to throw for ${country}`);
    } catch (err) {
      assert.ok(
        (err.errors || []).includes('Selected country is inconsistent with the entered PIN code.'),
        `Expected error for ${country}`
      );
    }
  }
});

test('Valid postal code for non-India country passes validation without errors', () => {
  const andorraResult = addressSchema.validateSync({
    billingAddress: createBaseBilling({ country: 'Andorra', postalCode: 'AD500', city: 'Andorra la Vella', state: 'Andorra' }),
    isShippingSameAsBilling: true,
  });
  assert.equal(andorraResult.billingAddress.country, 'Andorra');
  assert.equal(andorraResult.billingAddress.postalCode, 'AD500');

  const usResult = addressSchema.validateSync({
    billingAddress: createBaseBilling({ country: 'United States', postalCode: '90210', city: 'Beverly Hills', state: 'California' }),
    isShippingSameAsBilling: true,
  });
  assert.equal(usResult.billingAddress.country, 'United States');
  assert.equal(usResult.billingAddress.postalCode, '90210');
});

test('India address with non-6 digit postal code fails with specific Indian PIN error', () => {
  assert.throws(
    () => {
      addressSchema.validateSync({
        billingAddress: createBaseBilling({ country: 'India', postalCode: '1234' }),
        isShippingSameAsBilling: true,
      });
    },
    /Enter exactly 6 digits for the Indian PIN code/
  );
});

test('Separate shipping address validates country and PIN code consistency when isShippingSameAsBilling is false', () => {
  // Inconsistent shipping address fails
  try {
    addressSchema.validateSync({
      billingAddress: createBaseBilling({ country: 'India', postalCode: '560077' }),
      isShippingSameAsBilling: false,
      shippingAddress: createBaseBilling({ country: 'Andorra', postalCode: '560077' }),
    }, { abortEarly: false });
    assert.fail('Expected shipping address validation to throw');
  } catch (err) {
    const fieldErrors = (err.inner || []).map((e) => ({ path: e.path, message: e.message }));
    const countryErr = fieldErrors.find((e) => e.path === 'shippingAddress.country');
    const postalErr = fieldErrors.find((e) => e.path === 'shippingAddress.postalCode');

    assert.ok(countryErr, 'shippingAddress.country should have an error');
    assert.equal(countryErr.message, 'Selected country is inconsistent with the entered PIN code.');
    assert.ok(postalErr, 'shippingAddress.postalCode should have an error');
    assert.equal(postalErr.message, 'Selected country is inconsistent with the entered PIN code.');
  }

  // Consistent shipping address passes
  const validResult = addressSchema.validateSync({
    billingAddress: createBaseBilling({ country: 'India', postalCode: '560077' }),
    isShippingSameAsBilling: false,
    shippingAddress: createBaseBilling({ country: 'India', postalCode: '500081' }),
  });
  assert.equal(validResult.shippingAddress.country, 'India');
  assert.equal(validResult.shippingAddress.postalCode, '500081');
});


test('Billing street address rejects unsupported special characters from ticket samples', () => {
  const invalidStreets = [
    'Dkjdidi^%&^%6533()@##dfddf 55',
    'dwewe7767657988980haiuwheiof$#%$#^$^%$&h',
    'Address with @ and % and ^',
    'Address with & symbol',
    'Address with * or $',
  ];

  for (const street of invalidStreets) {
    try {
      addressSchema.validateSync({
        billingAddress: createBaseBilling({ street }),
        isShippingSameAsBilling: true,
      }, { abortEarly: false });
      assert.fail(`Expected validation to fail for street: "${street}"`);
    } catch (err) {
      const fieldErrors = (err.inner || []).map((e) => ({ path: e.path, message: e.message }));
      const streetErr = fieldErrors.find((e) => e.path === 'billingAddress.street');
      assert.ok(streetErr, `Expected billingAddress.street error for "${street}"`);
      assert.ok(
        streetErr.message.includes('Unsupported special characters are not allowed') ||
        streetErr.message.includes('consecutive special characters'),
        `Unexpected error message: ${streetErr.message}`
      );
    }
  }
});

test('Shipping street address rejects unsupported special characters when isShippingSameAsBilling is false', () => {
  const invalidStreets = [
    'Dkjdidi^%&^%6533()@##dfddf 55',
    'dwewe7767657988980haiuwheiof$#%$#^$^%$&h',
  ];

  for (const street of invalidStreets) {
    try {
      addressSchema.validateSync({
        billingAddress: createBaseBilling(),
        isShippingSameAsBilling: false,
        shippingAddress: createBaseBilling({ street }),
      }, { abortEarly: false });
      assert.fail(`Expected shipping address validation to fail for street: "${street}"`);
    } catch (err) {
      const fieldErrors = (err.inner || []).map((e) => ({ path: e.path, message: e.message }));
      const streetErr = fieldErrors.find((e) => e.path === 'shippingAddress.street');
      assert.ok(streetErr, `Expected shippingAddress.street error for "${street}"`);
      assert.ok(streetErr.message.includes('Unsupported special characters are not allowed'));
    }
  }
});

test('Billing street address rejects consecutive special characters', () => {
  const consecutiveStreets = [
    'Address with ## double hash',
    'Address with // double slash',
    'Address with ,, double comma',
    'Address with () empty brackets',
  ];

  for (const street of consecutiveStreets) {
    try {
      addressSchema.validateSync({
        billingAddress: createBaseBilling({ street }),
        isShippingSameAsBilling: true,
      }, { abortEarly: false });
      assert.fail(`Expected validation to fail for consecutive symbols in: "${street}"`);
    } catch (err) {
      const fieldErrors = (err.inner || []).map((e) => ({ path: e.path, message: e.message }));
      const streetErr = fieldErrors.find((e) => e.path === 'billingAddress.street');
      assert.ok(streetErr, `Expected error for "${street}"`);
      assert.equal(streetErr.message, 'Street address cannot contain consecutive special characters.');
    }
  }
});

test('Valid street addresses pass billing and shipping validation', () => {
  const validStreets = [
    'Plot 14, Software Units Layout',
    '#42, 3rd Cross, Indiranagar',
    'H.No: 12-3/4, St. Marks Road',
    "King's Avenue, Apt 5-B",
    'Flat 302, Green Glen Layout (Near Water Tank)',
    '123 Main Street',
    'Building 5A, Cyber Gateway, HITEC City',
  ];

  for (const street of validStreets) {
    const res = addressSchema.validateSync({
      billingAddress: createBaseBilling({ street }),
      isShippingSameAsBilling: false,
      shippingAddress: createBaseBilling({ street }),
    });
    assert.equal(res.billingAddress.street, street);
    assert.equal(res.shippingAddress.street, street);
  }
});
