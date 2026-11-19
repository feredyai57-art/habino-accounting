import assert from 'node:assert/strict';
import { BazaarBillingEngine } from '../src/lib/bazaarBillingEngine';
import {
  FUTURE_RELEASE_MODULES,
  HABINO_ADDONS,
  HabinoAuthEngine,
  PLATFORM_ONLY_MODULES,
  PLAN_LIMITS
} from '../src/lib/authEngine';
import { BazaarDoubleEntryLedgerEngine } from '../src/lib/bazaarLedgerWebhookEngine';
import { AppUser, Tenant } from '../src/types';
import { isModuleRelevantToGuild } from '../src/lib/moduleVisibility';

const tenantOwner: AppUser = {
  id: 'license-test-owner',
  tenantId: 'license-test-tenant',
  email: 'owner@example.test',
  phone: '',
  fullName: 'Tenant Owner',
  role: 'tenant_owner',
  permissions: [],
  status: 'active',
  createdAt: new Date(0).toISOString()
};

const enterpriseTenant: Tenant = {
  id: tenantOwner.tenantId,
  name: 'License Test Tenant',
  slug: 'license-test-tenant',
  guildType: 'technology',
  ownerEmail: tenantOwner.email,
  ownerName: tenantOwner.fullName,
  status: 'active',
  createdAt: new Date(0).toISOString(),
  subscription: {
    plan: 'enterprise',
    planNameFa: PLAN_LIMITS.enterprise.planNameFa,
    status: 'active',
    maxUsers: PLAN_LIMITS.enterprise.maxUsers,
    expiresAt: '9999-12-31T23:59:59.999Z',
    activeAddons: ['addon_synapse', 'addon_smb_sales_agent', 'addon_basket_logistics']
  },
  metadata: {}
};

const platformAdmin = { ...tenantOwner, id: 'license-test-platform-admin', role: 'super_admin' as const };
assert.equal(
  HabinoAuthEngine.canMutateData(platformAdmin, 'create', { isImpersonatingReadOnly: true }).allowed,
  false,
  'platform administrators must not mutate tenant data during read-only impersonation'
);
assert.equal(
  HabinoAuthEngine.canMutateData(platformAdmin, 'create').allowed,
  true,
  'platform administrators retain their normal mutation permission outside impersonation'
);
assert.equal(
  HabinoAuthEngine.canMutateData({ ...tenantOwner, role: 'hubino_support' }, 'update').allowed,
  false,
  'platform support must not mutate tenant data'
);

for (const moduleId of ['accounting_verification', 'diagnostics', 'pre_launch_qa', 'stress_test', 'tenant_isolation']) {
  assert.equal(
    PLATFORM_ONLY_MODULES.has(moduleId),
    true,
    `${moduleId} must remain a platform-only testing tool`
  );
}

assert.equal(
  HabinoAuthEngine.hasPermission(tenantOwner, 'accounting:manage_installments'),
  true,
  'existing tenant owner profiles should retain the newly introduced installment capability through role defaults'
);

for (const moduleId of PLATFORM_ONLY_MODULES) {
  assert.equal(
    HabinoAuthEngine.isFeatureAllowedByPlan('enterprise', moduleId).allowed,
    false,
    `${moduleId} must not be granted by an enterprise tenant license`
  );
  assert.equal(
    HabinoAuthEngine.canAccessModule(tenantOwner, moduleId, enterpriseTenant).gateType,
    moduleId === 'admin_panel' ? 'role' : 'platform',
    `${moduleId} must be restricted to the Hubino platform`
  );
}

for (const moduleId of FUTURE_RELEASE_MODULES) {
  assert.equal(
    HabinoAuthEngine.isFeatureAllowedByPlan('enterprise', moduleId).allowed,
    false,
    `${moduleId} must remain unavailable until its release`
  );
  assert.equal(
    HabinoAuthEngine.canAccessModule(tenantOwner, moduleId, enterpriseTenant).gateType,
    'release',
    `${moduleId} must remain unavailable even when an old add-on is active`
  );
}

for (const moduleId of ['analytics', 'barcode_scanner', 'did_protocol', 'payroll', 'projects', 'reports']) {
  assert.equal(
    HabinoAuthEngine.canAccessModule(tenantOwner, moduleId, enterpriseTenant).allowed,
    true,
    `${moduleId} should be available to an enterprise tenant owner`
  );
}

for (const guildType of ['services', 'technology', 'contracting', 'commercial'] as const) {
  for (const moduleId of ['payroll', 'projects']) {
    assert.equal(
      HabinoAuthEngine.canAccessModule(tenantOwner, moduleId, {
        ...enterpriseTenant,
        guildType
      }).allowed && isModuleRelevantToGuild(moduleId, guildType),
      true,
      `${moduleId} must be accessible and visible to enterprise tenants in the ${guildType} guild`
    );
  }
}

assert.equal(
  HabinoAuthEngine.canAccessModule(
    { ...tenantOwner, role: 'super_admin' },
    'roadmap',
    enterpriseTenant
  ).allowed,
  true,
  'Hubino super admins retain internal roadmap access'
);
assert.equal(
  HABINO_ADDONS.find(addon => addon.id === 'addon_synapse')?.status,
  'coming_soon',
  'Synapse must not be offered as a currently available add-on'
);

const unavailableSynapseReceipt = BazaarBillingEngine.generateSimulatedReceipt(
  'habino_bazaar_synapse_ai',
  enterpriseTenant.id,
  'license-test-client'
);
const unavailableSynapsePurchase = await BazaarBillingEngine.verifyBazaarPurchaseRpc(
  unavailableSynapseReceipt,
  { id: 'license-test-client', name: 'Test Client', balance: 0, type: 'individual' },
  enterpriseTenant.id
);
assert.equal(unavailableSynapsePurchase.success, false, 'Synapse IAP must be rejected before fulfillment');
assert.equal(unavailableSynapsePurchase.errorCode, 'ERR_PRODUCT_UNAVAILABLE');

const unavailableSynapseWebhook = BazaarDoubleEntryLedgerEngine.processBazaarPaymentWebhook({
  eventId: 'license-test-synapse-event',
  eventType: 'PURCHASE_COMPLETED',
  packageId: 'ir.habino.app',
  productId: 'habino_synapse_ai',
  purchaseToken: 'license-test-synapse-token',
  orderId: 'license-test-synapse-order',
  purchaseTime: Date.now(),
  amount: 0,
  bazaarFeePercentage: 15,
  vatPercentage: 10,
  currency: 'IRT',
  tenant_id: enterpriseTenant.id,
  client: { id: 'license-test-client', name: 'Test Client', isActive: true },
  bazaarRsaSignature: 'SIG_VALID_12345678'
});
assert.equal(unavailableSynapseWebhook.success, false, 'Synapse webhooks must be rejected before ledger posting');
assert.equal(unavailableSynapseWebhook.errorCode, 'ERR_PRODUCT_UNAVAILABLE');
assert.equal(unavailableSynapseWebhook.document, undefined);
assert.equal(unavailableSynapseWebhook.licenseUpdate, undefined);

console.log('All license entitlement tests passed.');
