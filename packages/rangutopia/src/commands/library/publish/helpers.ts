import {detectChannel} from "./configs.js";
import type {
    Channels,
    IncreaseVersionResult,
    NpmPackageVersions,
    Package,
    PackageState,
    YarnWorkspaceInfo
} from "./types.js";
import spawn from "nano-spawn";
import {getMonorepoManager, logger, type MonorepoGraph} from "../../../modules/mod.js";
import {Graph, ROOT_KEY} from "./graph.js";
import {
    packageJsonPath,
    readAndValidatePacakgeJson,
    readPackageJson,
    updatePackageJson
} from "../../../utils/packageJson.js";
import {should} from "./features.js";
import {
    CustomScriptError,
    GitError, GithubCreateReleaseFailedError,
    GithubGetReleaseError,
    GithubReleaseNotFoundError, IncreaseVersionFailedError,
    NpmGetPackageError,
    NpmPackageNotFoundError, NpmPublishError,
    UnableToProceedPublishError
} from "./errors.js";
import {yarnCommands} from "../../../utils/yarn.js";
import {
    generateChangelogAndSave,
    memoizeGenerateChangelog,
    TAG_PACKAGE_PREFIX
} from "../../../utils/changelog.js";
import { Bumper } from "conventional-recommended-bump";
import {DEPENDENCY_KEYS, PUBLISH_COMMIT_SUBJECT} from "./constants.js";

export async function getAffectedPackages(sinceStart: boolean) {
    const channel = detectChannel();
    // the source code for these packages have been updated.
    const onlyChangedPackages = await getChangedPackagesFor(channel, sinceStart);
    // changes will affect other packages as well, this is the full list.
    const allAffectedPackages = await analyzeChangesEffects(onlyChangedPackages);

    return allAffectedPackages;
}

async function getChangedPackagesFor(channel: Channels, sinceStart: boolean) {
    let baseCommit;
    if (channel === 'experimental') {
        const branch = getBaseBranchForExperimental();
        const originBranch = `origin/${branch}`;
        if (await isBranchAncestorOfHead(originBranch)) {
            baseCommit = await getBaseBranchCommitHashId(originBranch);
        } else {
            throw new Error('Your branch must be based on `main`.');
        }
    } else {
        // Detect last release and what packages has changed since then.
        const useTagForDetectLastRelease = channel === 'prod';
        baseCommit = await getLastReleasedHashId(useTagForDetectLastRelease);
    }

    let changedPkgs: Package[];
    if (sinceStart)
        changedPkgs = await workspacePackages();
    else if (baseCommit)
        changedPkgs =  await changed(baseCommit);
    else
        throw new Error("Couldn't find the commit hash to compare to for the selected method")

    return changedPkgs;
}

async function changed(since: string) {
    const pkgs = await workspacePackages();
    const all = await Promise.all(
        pkgs.map((pkg) => {
            let command = ['log', `${since}..HEAD`, '--oneline', '--', pkg.location];
            if (!since) {
                command = ['log', '--oneline', '--', pkg.location];
            }

            return spawn('git', command).then(({ stdout: result }) => {
                return {
                    ...pkg,
                    changed: !!result,
                };
            });
        })
    );

    // Kepp only changed packages and then clean up the object to remove `changed` property.
    return all.filter((pkg) => pkg.changed).map(({ changed, ...pkg }) => pkg);
}

async function getLastReleasedHashId(useTag = false) {
    if (useTag) {
        const { stdout: hash } = await spawn('git', [
            'rev-list',
            '--max-count',
            '1',
            '--tags',
        ]);
        return hash;
    } else {
        const { stdout: hash } = await spawn('git', [
            'log',
            '--grep',
            '^chore(release): publish',
            '-n',
            '1',
            '--pretty=format:%H',
        ]);
        return hash;
    }
}

// All the experimental releases should be a branch of `main`, if this policy changed (like publish from other base branches like `next`), we can add it here.
function getBaseBranchForExperimental() {
    return 'main';
}

async function isBranchAncestorOfHead(branch: string) {
    try {
        await spawn('git', ['merge-base', '--is-ancestor', branch, 'HEAD']);
        return true;
    } catch {
        return false;
    }
}

async function getBaseBranchCommitHashId(branch: string) {
    const { stdout: hash } = await spawn('git', ['merge-base', branch, 'HEAD']);
    return hash;
}

async function getLastCommitHashId() {
    const { stdout: hash } = await spawn('git', ['rev-parse', 'HEAD']);
    return hash;
}

async function analyzeChangesEffects(changedPkgs: Package[]) {
    const monorepoGraph = await getMonorepoManager().graph();
    const graph = new Graph();
    const { nodesCount, edgesCount } = monorepoGraphToGraph(monorepoGraph, graph);
    graph.onlyAffected(changedPkgs.map((pkg) => pkg.name));
    const sortedList = graph.sort();
    const sortedPackagesToPublish = await packageNamesToPackagesWithInfo([
        ...sortedList,
    ]);

    logger.table([
        {
            name: 'Affected pacakges',
            value: sortedPackagesToPublish.length,
        },
        {
            name: 'Nodes',
            value: nodesCount,
        },
        {
            name: 'edges',
            value: edgesCount,
        },
        {
            name: 'Are we good?',
            // Note: these two numbers should be equal.
            value: nodesCount === edgesCount ? 'yes' : 'no',
        },
    ]);

    logger.info(
        `Ordering: ${sortedPackagesToPublish.map((pkg) => pkg.name).join(',')}`,
    );
    return sortedPackagesToPublish;
}

async function packageNamesToPackagesWithInfo(names: string[]) {
    const allPackages = await workspacePackages();
    const packages: Package[] = [];
    names.forEach((pkgName) => {
        const packageInWorkspace = allPackages.find((pkg) => pkg.name === pkgName);
        if (!!packageInWorkspace) {
            packages.push(packageInWorkspace);
        }
    });

    return packages;
}

function monorepoGraphToGraph(monorepoGraph: MonorepoGraph, graph: Graph) {
    const nodes = monorepoGraph.nodes;
    nodes.forEach((node) => graph.addNode(node));

    const edges = detectEdges(monorepoGraph.dependencies);

    edges.forEach((sourceNodeValue, sourceNode) => {
        if (sourceNodeValue.outdeg.length > 0) {
            sourceNodeValue.outdeg.forEach((targetNode) => {
                graph.addEdge(sourceNode, targetNode);
            });
        }

        // If there is no indeg, it means it's a root package.
        if (sourceNodeValue.indeg.length === 0) {
            graph.addEdge(ROOT_KEY, sourceNode);
        }
    });

    return {
        edgesCount: edges.size,
        nodesCount: nodes.length,
    };
}

export function detectEdges(nodesWithDependencies: MonorepoGraph["dependencies"]) {
    const output = new Map<string, {indeg: string[], outdeg: string[]}>();
    nodesWithDependencies.forEach((targetNodes, sourceNode) => {
        const data = {
            node: sourceNode,
            outdeg: targetNodes,
        };

        // Add/update source target
        add(data, output);

        // Update target node
        if (nodesWithDependencies.get(sourceNode).length > 0) {
            targetNodes.forEach((targetNode) => {
                add({ node: targetNode, indeg: [sourceNode] }, output);
            });
        }
    });

    return output;
}

function add(data: { node: string, outdeg?: string[], indeg?: string[] }, list: Map<string, {indeg: string[], outdeg: string[]}>) {
    const { node, indeg, outdeg } = data;

    if (!list.has(node)) {
        list.set(node, {
            indeg: [],
            outdeg: [],
        });
    }

    const recored = list.get(node);
    if (indeg) {
        recored.indeg.push(...indeg);
    }
    if (outdeg) {
        recored.outdeg.push(...outdeg);
    }

    return list;
}

export async function update(pkg: Package) {
    const channel = detectChannel();

    // Increase package version
    const updatedPkg = await increaseVersion(channel, pkg);

    logger.verbose(
        `Upgrade all the dependent packages of ${updatedPkg.version} to latest version`
    );
    await upgradeDependents(updatedPkg);

    const tag: string | null = should('checkGitTags') ? await gitTagFor(updatedPkg) : null;

    const release: string | null = should('checkGithubRelease')
        ? await githubReleaseFor(updatedPkg)
        : null;
    const npmVersionInfo = should('checkNpm')
        ? await npmVersionFor(updatedPkg)
        : null;
    const npmVersion = npmVersionInfo ? npmVersionInfo[channel] : null;

    return {
        version: updatedPkg.version,
        githubRelease: release,
        gitTag: tag,
        npmVersion: npmVersion,
    };
}

async function increaseVersion(channel: Channels, pkg: Package) {
    if (channel === 'prod') {
        return await increaseVersionForProd(pkg);
    } else if (channel === 'next') {
        return await increaseVersionForNext(pkg);
    } else if (channel === 'experimental') {
        return await increaseVersionForExperimental(pkg);
    } else {
        throw new Error(`Your target channel not supported. channel: ${channel}`);
    }
}

async function increaseVersionForExperimental(pkg: Package) {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = now.getUTCDate().toString().padStart(2, '0');
    const date = `${yyyy}${mm}${dd}`;

    const commitId = (await getLastCommitHashId()).slice(0, 8);

    const newVersion = `0.0.0-experimental-${commitId}-${date}`;
    const versions: IncreaseVersionResult = await yarnCommands.bumpToVersion(pkg.name, newVersion)
        .then((result) => result.stdout)
        .then((output) => {
            const versions = parseYarnVersionResult(output);

            if (!versions.current && !versions.next) {
                throw new IncreaseVersionFailedError(
                    `Couldn't extract versions from logs \n ${output}`
                );
            }
            return versions;
        })
        .catch((err) => {
            if (err instanceof IncreaseVersionFailedError) throw err;

            throw new IncreaseVersionFailedError(err.stderr);
        });

    return {
        ...pkg,
        version: versions.next,
    };
}

async function increaseVersionForNext(pkg: Package) {
    const versions: IncreaseVersionResult = await yarnCommands.bumpPrereleaseVersion(pkg.name)
        .then((result) => result.stdout)
        .then((output) => {
            const versions = parseYarnVersionResult(output);

            if (!versions.current && !versions.next) {
                throw new IncreaseVersionFailedError(
                    `Couldn't extract versions from logs \n ${output}`
                );
            }
            return versions;
        })
        .catch((err) => {
            if (err instanceof IncreaseVersionFailedError) throw err;

            throw new IncreaseVersionFailedError(err.stderr);
        });

    return {
        ...pkg,
        version: versions.next,
    };
}

async function increaseVersionForProd(pkg: Package) {
    const recommendation = await recommendBump(pkg);
    if (!("releaseType" in recommendation)) {
        throw new Error(`Couldn't get a release type for ${pkg.name}`)
    }
    const releaseType = recommendation.releaseType;

    const versions: IncreaseVersionResult = await yarnCommands.bumpProductionVersion(pkg.name, releaseType)
        .then((result) => result.stdout)
        .then((output) => {
            const versions = parseYarnVersionResult(output);

            if (!versions.current && !versions.next) {
                throw new IncreaseVersionFailedError(
                    `Couldn't extract versions from logs \n ${output}`
                );
            }
            return versions;
        })
        .catch((err) => {
            if (err instanceof IncreaseVersionFailedError) throw err;

            throw new IncreaseVersionFailedError(err.stderr);
        });

    return {
        ...pkg,
        version: versions.next,
    };
}

function parseYarnVersionResult(output: string) {
    const logs: {type: string, data: string}[] = output.split('\n').map((jsonString) => JSON.parse(jsonString));

    const versions: IncreaseVersionResult = logs.reduce(
        (prev, log) => {
            if (log.data.startsWith('Current version:')) {
                return {
                    ...prev,
                    current: log.data.replace('Current version: ', ''),
                };
            }
            if (log.data.startsWith('New version:')) {
                return {
                    ...prev,
                    next: log.data.replace('New version: ', ''),
                };
            }
        },
        { current: null, next: null }
    );

    return versions;
}

async function recommendBump(pkg) {
    const bumper = new Bumper().loadPreset('angular');
    bumper.tag({
        prefix: TAG_PACKAGE_PREFIX(pkg),
    });
    const recommendation = await bumper.bump();

    return recommendation;
}

async function npmVersionFor(pkg: Package) {
    try {
        const npmVersions = await getNpmPackage(pkg);
        return npmVersions;
    } catch (err) {
        if (err instanceof NpmPackageNotFoundError) {
            return null;
        }

        throw err;
    }
}

async function getNpmPackage(pkg: Package): Promise<NpmPackageVersions> {
    const packageName = pkg.name;
    const headers = new Headers();
    // This is to use less bandwidth unless we really need to get the full response.
    // See https://github.com/npm/npm-registry-client#request
    headers.append(
        'Accept',
        'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
    );
    // scoped packages contain slashes and the npm registry expects them to be escaped
    const response = await fetch(
        `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
        {
            headers,
        }
    ).catch((err) => {
        const msg =
            err.message || 'An error has occured when trying to get npm package.';
        throw new NpmGetPackageError(msg);
    });

    const body = await response.json();

    // A new package which never has been published on npm.
    if (response.status === 404) {
        throw new NpmPackageNotFoundError(packageName);
    } else if (response.status > 300) {
        const msg = `Package: ${packageName}, Status: ${response.status}, Body: ${body}`;
        throw new NpmGetPackageError(msg);
    }

    const versions: NpmPackageVersions = {
        next: body['dist-tags'].next || null,
        prod: body['dist-tags'].latest || null,
    };

    return versions;
}

async function githubReleaseFor(pkg: Package) {
    try {
        const release = await getGithubReleaseFor(pkg);
        return release.tagName;
    } catch (err) {
        if (err instanceof GithubReleaseNotFoundError) {
            return null;
        }

        throw err;
    }
}

async function getGithubReleaseFor(pkg: Package): Promise<{ tagName: string; }> {
    const tag = generateTagName(pkg);

    const result = await spawn('gh', [
        'release',
        'view',
        tag,
        '--json',
        'tagName',
    ]).catch((err) => {
        console.log("RELEASE ERRRRRRRRRRRRRRRRR")
        console.log(err.exitCode)
        console.log(err.stderr)
        if (err.stderr === 'release not found') {
            throw new GithubReleaseNotFoundError(tag);
        }
        throw new GithubGetReleaseError(err.message);
    });

    const release: { tagName: string; } = JSON.parse(result.stdout);

    return release;
}

function generateTagName(pkg: Package) {
    return `${packageNameWithoutScope(pkg.name)}@${pkg.version}`;
}

function packageNameWithoutScope(name: string) {
    return name.replace(/@.+\//, '');
}

async function gitTagFor(pkg: Package) {
    const tagExist = await isReleaseTagExistFor(pkg);

    if (tagExist) {
        const tagName = generateTagName(pkg);
        return tagName;
    }

    return null;
}

async function isReleaseTagExistFor(pkg: Package) {
    const tag = generateTagName(pkg);

    const result = await spawn('git', ['tag', '-l', tag])
        .then((result) => result.stdout)
        .catch((err) => {
            throw new GitError(
                `An error occurred on getting tags \n ${err.message} \n ${err.stderr}`
            );
        });

    const isExist = !!result;
    return isExist;
}

export function throwIfUnableToProceed(pkgsState: Partial<PackageState>[]) {
    const channel = detectChannel();
    if (channel === 'prod') {
        // TODO: it's better to check `npm` version should be less than `package.version`
        const alreadyPublishedPackages = pkgsState.filter(
            (pkgState) => pkgState.version === pkgState.npmVersion
        );
        const alreadyHasGithubReleasePackages = pkgsState.filter(
            (pkgState) => !!pkgState.githubRelease
        );
        const alreadyHasGitTagPackages = pkgsState.filter(
            (pkgState) => !!pkgState.gitTag
        );

        if (alreadyPublishedPackages.length) {
            const list = alreadyPublishedPackages
                .map((pkg) => pkg.npmVersion)
                .join(',');
            throw new UnableToProceedPublishError(
                `These versions have been published on NPM already. \n ${list}`
            );
        } else if (alreadyHasGithubReleasePackages.length) {
            const list = alreadyHasGithubReleasePackages
                .map((pkg) => pkg.githubRelease)
                .join(',');
            throw new UnableToProceedPublishError(
                `These versions have been released on Github before. \n ${list}`
            );
        } else if (alreadyHasGitTagPackages.length) {
            const list = alreadyHasGithubReleasePackages
                .map((pkg) => pkg.gitTag)
                .join(',');
            throw new UnableToProceedPublishError(
                `These tags already exist. \n ${list}`
            );
        }
    }
}

export async function build(pkgs: Package[]) {
    performance.mark(`start-publish-build`);

    await getMonorepoManager().build(pkgs.map((pkg) => pkg.name))

    performance.mark(`end-publish-build`);
    const duration_build = performance.measure(
        `publish-build`,
        `start-publish-build`,
        `end-publish-build`
    ).duration;
    logger.info(`Built. ${duration_build}ms`);
}

export async function tryPublish(pkgs: Package[], { onUpdateState }: {onUpdateState: (
        pkgName: string,
        name: "gitTag" | "githubRelease" | "npmVersion" | "version",
        value: string,
    ) => void}) {
    const tasks = pkgs.map(
        (pkg) => () =>
            publishTask(pkg, { onUpdateState }).catch((e) => {
                e.cause = {
                    pkg,
                };
                throw e;
            })
    );
    await sequentiallyRun(tasks);

    logger.info(`Published.`);
}

async function publishTask(pkg: Package, { onUpdateState }: {onUpdateState: (
        pkgName: string,
        name: "gitTag" | "githubRelease" | "npmVersion" | "version",
        value: string,
    ) => void}) {
    if (should('generateChangelog')) {
        logger.success(`[1/3] Making changelog`);
        await generateChangelogAndSave(pkg);
    } else {
        logger.success(`[1/3] Skipping changelog and github release.`);
    }

    logger.success(`[2/3] Publish ${pkg.name} to npm`);
    await publishOnNpm(pkg);
    onUpdateState(pkg.name, 'npmVersion', pkg.version);

    logger.success(`[3/3] Adding files to staging area`);
    await addPkgFileChangesToStage(pkg);

    logger.success(`🚀 ${pkg.name} published.`);
}

async function upgradeDependents(pkg: Package) {
    try {
        logger.info(`Upgrading for ${pkg.name} \n`);
        await upgradeDependentsOf(pkg.name, pkg.version);
    } catch (error) {
        throw new CustomScriptError(error)
    }
}

async function upgradeDependentsOf(project: string, version: string) {
    const { stdout: info } = await yarnCommands.getWorkspaces(false);
    const workspaces = JSON.parse(info);

    // Going through all workspace and find packages which depends on `project`
    const dependents = [];
    const pkgs = Object.keys(workspaces);
    pkgs.forEach((pkg) => {
        if (
            workspaces[pkg].workspaceDependencies.includes(project) ||
            workspaces[pkg].mismatchedWorkspaceDependencies.includes(project)
        ) {
            const pkgJson = readPackageJson(packageJsonPath(workspaces[pkg].location));
            if (!pkgJson.private) {
                dependents.push(pkg);
            } else {
                logger.warn(`SKIPPING UPDATING ${project} in ${pkg}`)
            }
        }
    });

    if (dependents.length === 0) {
        logger.info(`It seems ${project} isn't used by any packages. Skip...`);
        return;
    }

    logger.info(
        `These packages are using ${project}: ${dependents.join(',')} \n`
    );

    logger.info(`Using fixed version for ${project} which is ${version}. \n`);

    await Promise.all(
        dependents.map((pkg) =>
            updateVersion(
                { path: workspaces[pkg].location },
                { name: project, version }
            )
        )
    );
}

async function updateVersion(target: {path: string}, upgrade: {name: string, version: string}) {
    const { path } = target;
    const { name, version } = upgrade;
    const pkgPath = packageJsonPath(path);

    const updatedPkgJson = readPackageJson(pkgPath);

    let foundPkg = false;
    DEPENDENCY_KEYS.forEach(key => {
        if (updatedPkgJson[key]?.[name]) {
            updatedPkgJson[key][name] = `^${version}`;
            foundPkg = true
        }
    })

    if (!foundPkg) {
        throw new Error(
            `${name} not found, neither dependencies or devDependencies or peerDependencies.`
        );
    }


    updatePackageJson(pkgPath, updatedPkgJson);
}



async function publishOnNpm(pkg: Package) {
    const channel = detectChannel();
    const distTag = channel === 'prod' ? 'latest' : channel;
    const output = await yarnCommands.publish(pkg.location, distTag)
        .then(({ stdout }) => stdout)
        .catch((error) => {
            throw new NpmPublishError(error.stderr);
        });

    return output;
}

export async function addPkgFileChangesToStage(pkg) {
    await addFileToStage(`${pkg.location}/package.json`);
    if (should('generateChangelog')) {
        await addFileToStage(`${pkg.location}/CHANGELOG.md`);
    }
}

export async function sequentiallyRun(promises) {
    return promises.reduce((prev, task) => {
        return prev.then(() => {
            return task();
        });
    }, Promise.resolve());
}

export async function addFileToStage(path) {
    await spawn('git', ['add', path]).catch((e) => {
        throw new GitError(`"git add" failed. ${e.stderr}`);
    });
}

export async function publishCommitAndTags(pkgs: Package[]) {
    const isTaggingSkipped = !should('createPublishTag');
    const isCommittingSkipped = !should('createPublishCommit');
    const subject = `${PUBLISH_COMMIT_SUBJECT}\n\n`;
    const tags = pkgs.map(generateTagName);

    if (isCommittingSkipped && isTaggingSkipped) {
        logger.info('Creating commit and tag for this publish has been skipped.');
        return;
    }

    if (isCommittingSkipped && !isTaggingSkipped) {
        throw new Error(
            'The enviroment has been setup correctly. when tag is enabled, commit should be enabled as well.'
        );
    }

    const list = tags.map((tag) => `- ${tag}`).join('\n');
    const message = subject + list;
    let body = `Affected packages: ${tags.join(',')}`;

    // Making a publish commit
    await commit([message, body], {
        // When we are pushing a publish commit into main or next, it triggers a redundant workflow run,
        // To avoid this, by adding a [skip ci] the workflow run will be skipped.
        shouldSkipCI: true,

        // We need to pass no-verify to bypass commitlint.
        // NOTE: it will bypass precommit and commit-msg hooks.
        shouldVerify: false,
    });

    // Creating annotated tags based on packages
    if (!isTaggingSkipped) {
        await publishTags(pkgs);
    }

    return tags;
}

async function publishTags(pkgs: Package[]) {
    const tags = pkgs.map(generateTagName);

    // Creating annotated tags based on packages
    await Promise.all(
        tags.map((tag) =>
            spawn('git', ['tag', '-a', tag, '-m', tag]).catch((error) => {
                throw new GitError(`git tag failed. \n ${error.stderr}`);
            })
        )
    );

    return tags;
}

async function commit(messages: string[], options: {shouldSkipCI: boolean, shouldVerify: boolean}) {
    const { shouldVerify, shouldSkipCI } = options;

    const messagesWithCI = shouldSkipCI ? [...messages, '[skip ci]'] : messages;

    const commitArgs = [
        'commit',
        ...messagesWithCI.flatMap((msg) => ['-m', msg]),
        ...(shouldVerify ? [] : ['--no-verify']),
    ];

    try {
        await spawn('git', commitArgs);
    } catch (error) {
        throw new GitError(
            `git commit failed. \n ${error.stderr || error.message}`
        );
    }
}

export async function push(options?: {setupRemote: boolean, branch: string, remote: string}) {
    const { setupRemote, branch, remote = 'origin' } = options || {};

    let pushOptions = [];
    if (setupRemote) {
        if (!branch) {
            throw new CustomScriptError(
                `You should also pass branch name as parameter to push.`
            );
        }

        pushOptions = ['--set-upstream', remote, branch];
    } else {
        pushOptions = [remote, '--follow-tags', '--no-verify', '--atomic'];
    }

    const output = await spawn('git', ['push', ...pushOptions])
        .then(({ stdout }) => stdout)
        .catch((error) => {
            throw new GitError(`git push failed. \n ${error.stderr}`);
        });

    return output;
}

export async function makeGithubRelease(pkg: Package) {
    let notes = '';
    for await (let chunk of memoizeGenerateChangelog(pkg)) {
        notes += chunk;
    }

    const tagName = generateTagName(pkg);
    const output = await spawn('gh', [
        'release',
        'create',
        tagName,
        '--target',
        'main',
        '--notes',
        notes,
        '--verify-tag',
    ])
        .then(({ stdout }) => stdout)
        .catch((err) => {
            throw new GithubCreateReleaseFailedError(err.stdout);
        });

    return output;
}

async function workspacePackages() {
    const { stdout } = await yarnCommands.getWorkspaces();
    const result: YarnWorkspaceInfo = JSON.parse(stdout);
    const packagesName = Object.keys(result);
    const output = packagesName.map((name) => {
        const pkgJson = readAndValidatePacakgeJson(result[name].location);
        return {
            name,
            location: result[name].location,
            version: pkgJson.version,
            private: pkgJson.private || false,
        };
    });
    return output;
}
