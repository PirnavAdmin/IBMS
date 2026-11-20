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
