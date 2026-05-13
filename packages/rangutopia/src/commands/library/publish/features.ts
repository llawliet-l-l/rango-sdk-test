import {detectChannel} from "./configs.js";

/**
 *  Features configurations
 *
 * Note 1: Please add to `checkEnvironments` proper values when you add something to this object.
 * Note 2: Pass distribution channel as value.
 *
 */
const config = {
    generateChangelog: ['prod'],
    checkGithubRelease: ['prod'],
    checkGitTags: ['prod'],
    checkNpm: ['prod', 'next'],
    createPublishCommit: ['prod', 'next'],
    createPublishTag: ['prod'],
};

/**
 *
 * Check a config and returns `true` if should do anything.
 *
 */
export function should(key: string) {
    const channel = detectChannel();
    if (config[key].includes(channel)) {
        return true;
    }

    return false;
}
