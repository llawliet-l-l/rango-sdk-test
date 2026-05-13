import type {Channels} from "./commands/library/publish/types.js";

interface Configs {
    channel: Channels;
}

let configs: Partial<Configs> | null = null;

export const setConfigs = <T extends keyof Configs>(key: T, value: Configs[T]) => {
    if (!configs) configs = {};
    configs[key] = value;
}

export const getConfig = <T extends keyof Configs>(key: T): Configs[T] => {
    const value = configs?.[key];
    if (!value) throw new Error(`config ${key} has not been set`);
    return value;
}


