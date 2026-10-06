/**
 * Postal PIN Code Service for India
 * Resolves 6-digit Indian PIN codes to location, city (district), and state.
 */

// In-memory cache for fast lookups
const pincodeCache = new Map();

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

  // Return cached result if available
  if (pincodeCache.has(cleanPin)) {
    return pincodeCache.get(cleanPin);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${cleanPin}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Postal API returned HTTP status ${res.status}`);
    }

    const data = await res.json();
    const resultBlock = Array.isArray(data) ? data[0] : null;

    if (
      !resultBlock ||
      resultBlock.Status !== 'Success' ||
      !Array.isArray(resultBlock.PostOffice) ||
      resultBlock.PostOffice.length === 0
    ) {
      return {
        success: false,
        message: resultBlock?.Message || 'No postal records found for this PIN code',
      };
    }

    const postOffices = resultBlock.PostOffice;

    // Pick best match for locality: prefer Sub Post Office or Head Post Office, then first office
    const primaryOffice =
      postOffices.find(
        (po) =>
          po.BranchType === 'Sub Post Office' ||
          po.BranchType === 'Head Post Office' ||
          (po.DeliveryStatus && po.DeliveryStatus.toLowerCase() === 'delivery')
      ) || postOffices[0];

    // Extract unique location names for suggestions
    const allLocations = [
      ...new Set(
        postOffices
          .map((po) => po.Name?.trim())
          .filter(Boolean)
      ),
    ];

    const result = {
      success: true,
      location: primaryOffice.Name?.trim() || '',
      city: primaryOffice.District?.trim() || primaryOffice.Division?.trim() || '',
      state: primaryOffice.State?.trim() || '',
      country: primaryOffice.Country?.trim() || 'India',
      allLocations,
      message: `${primaryOffice.District}, ${primaryOffice.State}`,
    };

    // Cache valid result
    pincodeCache.set(cleanPin, result);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      success: false,
      message:
        err.name === 'AbortError'
          ? 'PIN code lookup timed out'
          : err.message || 'Failed to lookup PIN code',
    };
  }
}
