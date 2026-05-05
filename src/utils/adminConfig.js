export const ADMIN_PLATFORM_CONFIG_KEY = "admin_platform_config_v1";
export const ADMIN_FEATURE_TOGGLES_KEY = "admin_feature_toggles_v1";

export const defaultPlatformConfig = {
  platformName: "Urban Ethnic",
  supportEmail: "support@urbanethnic.in",
  commissionRatePct: 10,
  maxImagesPerProduct: 5,
};

export const defaultFeatureToggles = {
  ownerSelfRegistration: true,
  rentalFeature: true,
  cityBasedFiltering: true,
  emailNotifications: false,
  maintenanceMode: false,
};

const clampNumber = (value, { min, max, fallback }) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
};

const readJson = (key, fallback) => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return raw && typeof raw === "object" ? raw : fallback;
  } catch {
    return fallback;
  }
};

export const readPlatformConfig = () => {
  const raw = readJson(ADMIN_PLATFORM_CONFIG_KEY, {});
  return {
    platformName: String(raw?.platformName || defaultPlatformConfig.platformName).trim() || defaultPlatformConfig.platformName,
    supportEmail: String(raw?.supportEmail || defaultPlatformConfig.supportEmail).trim() || defaultPlatformConfig.supportEmail,
    commissionRatePct: clampNumber(raw?.commissionRatePct, { min: 0, max: 100, fallback: defaultPlatformConfig.commissionRatePct }),
    maxImagesPerProduct: clampNumber(raw?.maxImagesPerProduct, { min: 1, max: 20, fallback: defaultPlatformConfig.maxImagesPerProduct }),
  };
};

export const writePlatformConfig = (next) => {
  const merged = { ...readPlatformConfig(), ...(next || {}) };
  try {
    localStorage.setItem(ADMIN_PLATFORM_CONFIG_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
  return merged;
};

export const readFeatureToggles = () => {
  const raw = readJson(ADMIN_FEATURE_TOGGLES_KEY, {});
  return {
    ownerSelfRegistration: Boolean(raw?.ownerSelfRegistration ?? defaultFeatureToggles.ownerSelfRegistration),
    rentalFeature: Boolean(raw?.rentalFeature ?? defaultFeatureToggles.rentalFeature),
    // Keep city-based rental filtering always enabled.
    cityBasedFiltering: true,
    emailNotifications: Boolean(raw?.emailNotifications ?? defaultFeatureToggles.emailNotifications),
    maintenanceMode: Boolean(raw?.maintenanceMode ?? defaultFeatureToggles.maintenanceMode),
  };
};

export const writeFeatureToggles = (next) => {
  const merged = { ...readFeatureToggles(), ...(next || {}), cityBasedFiltering: true };
  try {
    localStorage.setItem(ADMIN_FEATURE_TOGGLES_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent("ue:feature-toggles", { detail: merged }));
  } catch {
    // ignore
  }
  return merged;
};
