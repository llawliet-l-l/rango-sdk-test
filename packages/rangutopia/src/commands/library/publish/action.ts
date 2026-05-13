import {logger} from "../../../modules/mod.js";
import {type OptionsType} from "./options.js";
import {trySetConfigs} from "./configs.js";
import {
    tryPublish,
    build,
    getAffectedPackages,
    throwIfUnableToProceed,
    update,
    addPkgFileChangesToStage,
    publishCommitAndTags,
    push,
    makeGithubRelease,
} from "./helpers.js";
import {State} from "./state.js";
import {should} from "./features.js";

export async function action(commandOptions: OptionsType) {
    logger.githubAction.group('🔍 Checking environments...');
    logger.info(commandOptions)
    trySetConfigs(commandOptions);
    logger.githubAction.endGroup();

    // 1. Detect affected packages and increase version
    logger.githubAction.group('🔍 Anlyzing dependencies...');
    const affectedPkgs = await getAffectedPackages(commandOptions.sinceStart);
    const libPkgs = affectedPkgs.filter((pkg) => !pkg.private);

    if (libPkgs.length === 0) {
        logger.info('No library has changed. Skip.');
        process.exit(0);
    }

    logger.info('Current state:');
    logger.table(libPkgs);

    const state = new State(libPkgs);
    const updateTasks = libPkgs.map((pkg) => {
        return update(pkg).then((pkgState) => {
            state.setState(pkg.name, 'gitTag', pkgState.gitTag);
            state.setState(pkg.name, 'npmVersion', pkgState.npmVersion);
            state.setState(pkg.name, 'version', pkgState.version);
        });
    });
    await Promise.all(updateTasks);

    const pkgs = state.list();
    const pkgStates = pkgs.map((pkg) => state.getState(pkg.name));

    logger.info('Next state:');
    logger.table(
        pkgs.map((pkg) => {
            return {
                name: pkg.name,
                ...state.getState(pkg.name),
            };
        })
    );

    throwIfUnableToProceed(pkgStates);

    logger.githubAction.endGroup();

    // 2. Build all packacges
    /**
     * IMPORTANT NOTE:
     * We are all the libs in parallel, parcel has a limitation on running `parcel` instances.
     * So if you are trying to build multiple parcel apps it goes through some erros. here, for publishing libs
     * We are using esbuild so don't need to do anything.
     * but if we need, the potential solution is filtering parcel apps and run them secquentially.
     */

    logger.githubAction.group(`🔨 Start building...`);
    await build(pkgs);
    logger.githubAction.endGroup();

    // 3. Publish
    logger.githubAction.group(`🚀 Start publishing...`);
    try {
        await tryPublish(pkgs, {
            onUpdateState: state.setState.bind(state),
        });
    } catch (e) {
        logger.error(e);

        const pkg = e.cause.pkg;
        if (!pkg) {
            logger.error(
                "🚨 The error hasn't thrown `pkg`. Here is more information to debug"
            );
            logger.info(state.toJSON());
        } else {
            // Ignoring error since it's possible to file hasn't changed yet.
            await addPkgFileChangesToStage(pkg).catch(logger.warn);
        }
    }

    logger.githubAction.endGroup();

    // 4. Tag and Push

    /**
     * Our final list will includes only packages that published on NPM.
     * If a package failed on making changelog, github release, ...
     * We are considering it's published and should handle those cases manually.
     */
    const listPkgsForTag = state.list().filter((pkg) => {
        const isPublishedOnNpm = !!state.getState(pkg.name, 'npmVersion');
        return isPublishedOnNpm;
    });

    logger.githubAction.group(
        `🏷️ Tagging and commit... ${listPkgsForTag.length} packages for tagging.`
    );
    if (listPkgsForTag.length > 0) {
        performance.mark(`start-publish-tagging`);
        await publishCommitAndTags(listPkgsForTag);
        await push();
        performance.mark(`end-publish-tagging`);
        const duration_build = performance.measure(
            `publish-tagging`,
            `start-publish-tagging`,
            `end-publish-tagging`
        ).duration;
        logger.info(`Tagged. ${duration_build}ms`);
    } else {
        logger.info('Skipped.');
    }

    logger.githubAction.endGroup();

    // 5. Making github release
    // NOTE: If any error happens in this step we are don't bail out the process and will continue. A warning will be shown.
    logger.githubAction.group('🐙 Github release');
    if (should('generateChangelog')) {
        if (listPkgsForTag.length > 0) {
            performance.mark(`start-publish-gh-release`);

            const tasks = listPkgsForTag.map((pkg) => {
                return makeGithubRelease(pkg)
                    .then(() => {
                        state.setState(pkg.name, 'githubRelease', pkg.version);
                    })
                    .catch(logger.warn);
            });

            await Promise.all(tasks);

            performance.mark(`end-publish-gh-release`);
            const duration_build = performance.measure(
                `publish-gh-release`,
                `start-publish-gh-release`,
                `end-publish-gh-release`
            ).duration;
            logger.info(`Finished. ${duration_build}ms`);
        } else {
            logger.info('Skipped.');
        }
    } else {
        logger.info('Skipped as it set on environments.');
    }
    logger.githubAction.endGroup();

    // 6. Report
    logger.githubAction.group('::group::📊 Report');
    logger.table(
        pkgs.map((pkg) => {
            return {
                name: pkg.name,
                ...state.getState(pkg.name),
            };
        })
    );
    logger.githubAction.endGroup();

}
