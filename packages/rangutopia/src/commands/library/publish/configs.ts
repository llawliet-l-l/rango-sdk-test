import type {Channels} from "./types.js";
import {getConfig, setConfigs} from "../../../configs.js";
import type {OptionsType} from "./options.js";

export const trySetConfigs = (_options: OptionsType) => {
    const chosenFlowsCount = [
        _options.prod,
        _options.next,
        _options.experimental,
    ].filter(Boolean).length;
    if (chosenFlowsCount === 0)
        throw new Error(
            "You should at least choose one flow between '--prod', '--next' and '--experimental'",
        );
    if (chosenFlowsCount !== 1)
        throw new Error(
            "You should choose only one flow between '--prod', '--next' and '--experimental'",
        );

    let channel: Channels = "experimental";
    if (_options.prod) channel = "prod";
    if (_options.next) channel = "next";

    setConfigs("channel", channel)
}


/** @deprecated Use {@link getConfig}(`"channel"`) directly */
export const detectChannel = () : Channels => {
    return getConfig("channel")
}
