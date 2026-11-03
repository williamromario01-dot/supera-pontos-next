type InternalSubscription = { _id?: unknown; companyId?: unknown };
type ProviderLink = {
  _id?: unknown;
  provider?: unknown;
  environment?: unknown;
  companyId?: unknown;
  internalSubscriptionId?: unknown;
};

export function billingLinkBelongsToSubscription(
  subscription: InternalSubscription,
  link: ProviderLink,
  environment: "sandbox" | "production",
): boolean {
  return link.provider === "asaas" && link.environment === environment &&
    subscription._id != null && subscription.companyId != null &&
    link.internalSubscriptionId != null && link.companyId != null &&
    String(link.internalSubscriptionId) === String(subscription._id) &&
    String(link.companyId) === String(subscription.companyId);
}

/** Only the owning provider-link's exact ID can explain the historical reference. */
export function legacyBillingSubscriptionReference(
  subscription: InternalSubscription,
  link: ProviderLink,
  environment: "sandbox" | "production",
): string | undefined {
  if (!billingLinkBelongsToSubscription(subscription, link, environment)) return undefined;
  const linkId = String(link._id ?? "");
  return /^[a-f0-9]{24}$/.test(linkId) ? `subscription:${linkId}` : undefined;
}
