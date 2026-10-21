/**
 * Postal PIN Code Service for India
 * Resolves 6-digit Indian PIN codes to location, city (district), state, and country.
 * Uses a multi-tiered strategy:
 * 1. Local Vite Proxy (/api/pincode/:pin) for official post office database without CORS
 * 2. High-speed Zippopotam fallback with CORS headers
 * 3. Direct api.postalpincode.in
 * 4. Built-in geographic resolver for major Indian pin ranges
 */

// In-memory cache for fast lookups
const pincodeCache = new Map();

/**
 * Common Indian city & hub offline records
 */
const SPECIFIC_PIN_HUBS = {
  '500016': { location: 'Begumpet', city: 'Hyderabad', state: 'Telangana' },
  '500081': { location: 'Madhapur', city: 'Hyderabad', state: 'Telangana' },
  '500034': { location: 'Banjara Hills', city: 'Hyderabad', state: 'Telangana' },
  '500033': { location: 'Jubilee Hills', city: 'Hyderabad', state: 'Telangana' },
  '500001': { location: 'Hyderabad GPO', city: 'Hyderabad', state: 'Telangana' },
  '500002': { location: 'Charminar', city: 'Hyderabad', state: 'Telangana' },
  '500003': { location: 'Secunderabad', city: 'Hyderabad', state: 'Telangana' },
  '530048': { location: 'Madhurawada', city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  '530001': { location: 'Visakhapatnam HO', city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  '530016': { location: 'Dwarakanagar', city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  '520001': { location: 'Vijayawada HO', city: 'Vijayawada', state: 'Andhra Pradesh' },
  '560001': { location: 'Bangalore GPO', city: 'Bengaluru', state: 'Karnataka' },
  '400001': { location: 'Mumbai GPO', city: 'Mumbai', state: 'Maharashtra' },
  '110001': { location: 'Connaught Place', city: 'New Delhi', state: 'Delhi' },
  '600001': { location: 'Chennai GPO', city: 'Chennai', state: 'Tamil Nadu' },
  '700001': { location: 'Kolkata GPO', city: 'Kolkata', state: 'West Bengal' },
  '380001': { location: 'Ahmedabad GPO', city: 'Ahmedabad', state: 'Gujarat' },
  '302001': { location: 'Jaipur GPO', city: 'Jaipur', state: 'Rajasthan' },
  '411001': { location: 'Pune GPO', city: 'Pune', state: 'Maharashtra' },
};

function resolveOfflinePincode(cleanPin) {
  if (SPECIFIC_PIN_HUBS[cleanPin]) {
    const s = SPECIFIC_PIN_HUBS[cleanPin];
    return {
      success: true,
      location: s.location,
      city: s.city,
      state: s.state,
      country: 'India',
      allLocations: [s.location],
      message: `${s.city}, ${s.state}`,
    };
  }

  const pinNum = parseInt(cleanPin, 10);
  if (isNaN(pinNum)) return null;

  // Telangana (500000 - 509999)
  if (pinNum >= 500000 && pinNum <= 509999) {
    const isHyd = pinNum <= 500099;
    return {
      success: true,
      location: isHyd ? 'Hyderabad Region' : 'Telangana Area',
      city: isHyd ? 'Hyderabad' : 'Secunderabad',
      state: 'Telangana',
      country: 'India',
      allLocations: [],
      message: `${isHyd ? 'Hyderabad' : 'Secunderabad'}, Telangana`,
    };
  }

  // Visakhapatnam & Coastal AP (530000 - 535999)
  if (pinNum >= 530000 && pinNum <= 531999) {
    return {
      success: true,
      location: 'Visakhapatnam Region',
      city: 'Visakhapatnam',
      state: 'Andhra Pradesh',
      country: 'India',
      allLocations: [],
      message: 'Visakhapatnam, Andhra Pradesh',
    };
  }

  // Andhra Pradesh (515000 - 535999)
  if (pinNum >= 515000 && pinNum <= 535999) {
    const isVja = pinNum >= 520000 && pinNum <= 521999;
    return {
      success: true,
      location: isVja ? 'Vijayawada Region' : 'Andhra Pradesh Area',
      city: isVja ? 'Vijayawada' : 'Andhra Pradesh Region',
      state: 'Andhra Pradesh',
      country: 'India',
      allLocations: [],
      message: isVja ? 'Vijayawada, Andhra Pradesh' : 'Andhra Pradesh',
    };
  }

  // Bengaluru & Karnataka (560000 - 599999)
  if (pinNum >= 560000 && pinNum <= 562999) {
    return {
      success: true,
      location: 'Bengaluru Region',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      allLocations: [],
      message: 'Bengaluru, Karnataka',
    };
  }

  // Mumbai & Maharashtra (400000 - 449999)
  if (pinNum >= 400000 && pinNum <= 400104) {
    return {
      success: true,
      location: 'Mumbai Region',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      allLocations: [],
      message: 'Mumbai, Maharashtra',
    };
  }

  // Delhi (110000 - 110099)
  if (pinNum >= 110000 && pinNum <= 110099) {
    return {
      success: true,
      location: 'Delhi Region',
      city: 'New Delhi',
      state: 'Delhi',
      country: 'India',
      allLocations: [],
      message: 'New Delhi, Delhi',
    };
  }

  // Chennai & Tamil Nadu (600000 - 649999)
  if (pinNum >= 600000 && pinNum <= 600132) {
    return {
      success: true,
      location: 'Chennai Region',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      allLocations: [],
      message: 'Chennai, Tamil Nadu',
    };
  }

  // Kolkata & West Bengal (700000 - 749999)
  if (pinNum >= 700000 && pinNum <= 700157) {
    return {
      success: true,
      location: 'Kolkata Region',
      city: 'Kolkata',
      state: 'West Bengal',
      country: 'India',
      allLocations: [],
      message: 'Kolkata, West Bengal',
    };
  }

  return null;
}

async function fetchFromPostalPincodeIn(cleanPin) {
  const isBrowser = typeof window !== 'undefined';
  const urls = isBrowser
    ? [`/api/pincode/${cleanPin}`, `https://api.postalpincode.in/pincode/${cleanPin}`]
    : [`https://api.postalpincode.in/pincode/${cleanPin}`];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) continue;

      const data = await res.json();
      const resultBlock = Array.isArray(data) ? data[0] : null;

      if (
        resultBlock &&
        resultBlock.Status === 'Success' &&
        Array.isArray(resultBlock.PostOffice) &&
        resultBlock.PostOffice.length > 0
      ) {
        const postOffices = resultBlock.PostOffice;
        const primaryOffice =
          postOffices.find(
            (po) =>
              po.BranchType === 'Sub Post Office' ||
              po.BranchType === 'Head Post Office' ||
              (po.DeliveryStatus && po.DeliveryStatus.toLowerCase() === 'delivery')
          ) || postOffices[0];

        const allLocations = [
          ...new Set(
            postOffices
              .map((po) => po.Name?.trim())
              .filter(Boolean)
          ),
        ];

        return {
          success: true,
          location: primaryOffice.Name?.trim() || '',
          city: primaryOffice.District?.trim() || primaryOffice.Division?.trim() || '',
          state: primaryOffice.State?.trim() || '',
          country: primaryOffice.Country?.trim() || 'India',
          allLocations,
          message: `${primaryOffice.District}, ${primaryOffice.State}`,
        };
      }
    } catch (e) {
      // Continue to next URL
    }
  }
  return null;
}

async function fetchFromZippopotam(cleanPin) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://api.zippopotam.us/IN/${cleanPin}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();

    if (!data || !Array.isArray(data.places) || data.places.length === 0) {
      return null;
    }

    const place = data.places[0];
    let state = place.state?.trim() || '';

    // Fix legacy AP mapping for Telangana PIN range (500000 - 509999)
    const pinNum = parseInt(cleanPin, 10);
    if (pinNum >= 500000 && pinNum <= 509999 && state.toLowerCase() === 'andhra pradesh') {
      state = 'Telangana';
    }

    const allLocations = [
      ...new Set(data.places.map((p) => p['place name']?.trim()).filter(Boolean)),
    ];

    const location = place['place name']?.trim() || '';
    // Use place name or state as city
    const city = place['place name']?.trim() || state;

    return {
      success: true,
      location,
      city,
      state,
      country: 'India',
      allLocations,
      message: `${location}, ${state}`,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Lookup Indian Postal PIN code details.
 * @param {string} pincode - 6-digit PIN code
 * @returns {Promise<{success: boolean, location?: string, city?: string, state?: string, country?: string, allLocations?: string[], message?: string}>}
 */
export async function lookupIndiaPincode(pincode) {
  const cleanPin = String(pincode || '').trim().replace(/\D/g, '');

  if (!cleanPin || cleanPin.length !== 6 || !/^[1-9][0-9]{5}$/.test(cleanPin)) {
    return {
      success: false,
      message: 'Invalid Indian PIN code format (must be 6 digits)',
    };
  }

  // 1. Return cached result if available
  if (pincodeCache.has(cleanPin)) {
    return pincodeCache.get(cleanPin);
  }

  // 2. Try official Post Office database (via Vite proxy or direct)
  let result = await fetchFromPostalPincodeIn(cleanPin);

  // 3. Fallback to Zippopotam (with CORS support)
  if (!result || !result.success) {
    result = await fetchFromZippopotam(cleanPin);
  }

  // 4. Fallback to offline geographical resolver
  if (!result || !result.success) {
    result = resolveOfflinePincode(cleanPin);
  }

  if (result && result.success) {
    pincodeCache.set(cleanPin, result);
    return result;
  }

  return {
    success: false,
    message: 'No postal records found for this PIN code',
  };
}

export default { lookupIndiaPincode };
