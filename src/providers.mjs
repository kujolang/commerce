import { mockProvider, linkProvider, stripeProvider, polarProvider, paypalProvider, squareProvider, paddleProvider, lemonSqueezyProvider } from './providers/builtins.mjs';

const builtins = [mockProvider, linkProvider, stripeProvider, polarProvider, paypalProvider, squareProvider, paddleProvider, lemonSqueezyProvider];

export function createProviderRegistry(initial = builtins) {
  const registered = new Map();
  const register = provider => {
    if (!provider || !/^[a-z][a-z0-9-]{0,63}$/.test(provider.id || '')) throw new Error('Provider id must be a lowercase stable identifier.');
    for (const method of ['validateConfig', 'validateProduct', 'toPublicProduct', 'createCheckout', 'completeCheckout', 'validateWebhookConfig', 'verifyWebhook', 'normalizeWebhookEvent']) {
      if (typeof provider[method] !== 'function') throw new Error(`Provider ${provider.id} is missing ${method}().`);
    }
    if (!provider.version || !provider.capabilities || typeof provider.capabilities !== 'object') throw new Error(`Provider ${provider.id} must declare version and capabilities.`);
    if (registered.has(provider.id)) throw new Error(`Provider already registered: ${provider.id}`);
    registered.set(provider.id, Object.freeze(provider));
    return provider;
  };
  initial.forEach(register);
  return Object.freeze({ register, get: id => registered.get(id), has: id => registered.has(id), list: () => [...registered.values()] });
}

export const providerRegistry = createProviderRegistry();
export const providerFor = id => {
  const provider = providerRegistry.get(id);
  if (!provider) throw new Error(`Unknown Commerce provider: ${id}`);
  return provider;
};
export const providers = Object.freeze(Object.fromEntries(providerRegistry.list().map(provider => [provider.id, provider])));
export const capabilities = Object.freeze(Object.fromEntries(providerRegistry.list().map(provider => [provider.id, provider.capabilities])));
