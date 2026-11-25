// What each plan can do. Change prices/limits here.
export const PLANS = {
  free: {
    label: 'Free',
    maxGroups: 1,
    deleteScams: true,
    warnAndRemove: false,
    aiReview: false,
    allowList: false,
    strictMode: false,
    showPromo: true,
  },
  pro: {
    label: 'Pro',
    maxGroups: 1,
    deleteScams: true,
    warnAndRemove: true,
    aiReview: true,
    allowList: true,
    strictMode: true,
    showPromo: false,
  },
  business: {
    label: 'Business',
    maxGroups: 15,
    deleteScams: true,
    warnAndRemove: true,
    aiReview: true,
    allowList: true,
    strictMode: true,
    showPromo: false,
  },
};

export function can(plan, feature) {
  return Boolean((PLANS[plan] ?? PLANS.free)[feature]);
}
