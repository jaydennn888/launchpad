// Re-export the plugin registry from the .tsx module so existing imports
// (`from "./registry"`) keep working while JSX icons live in registry.tsx.
export * from "./registry.tsx";
