import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRangeError } from '../src/utils/dateRangeValidation.js';
const today='2026-10-28';
test('empty and partial date ranges cannot apply',()=>{
 for(const range of [{},{startDate:today},{endDate:today}]) assert.match(dateRangeError(range,today),/Select both/);
});
test('future dates including the reported two-year range are rejected',()=>{
 assert.match(dateRangeError({startDate:today,endDate:'2028-10-31'},today),/Future dates/);
});
test('reversed and invalid calendar dates cannot apply',()=>{
 assert.match(dateRangeError({startDate:today,endDate:'2026-10-01'},today),/on or after/);
 assert.match(dateRangeError({startDate:'2026-02-30',endDate:today},today),/valid dates/);
});
test('same-day and historical ranges can apply',()=>{
 assert.equal(dateRangeError({startDate:today,endDate:today},today),'');
 assert.equal(dateRangeError({startDate:'2024-01-01',endDate:today},today),'');
});
