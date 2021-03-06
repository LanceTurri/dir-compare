const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const debug = require('debug');
const md5 = require('md5');
const isBlacklisted = require('../helpers/isBlacklistedFolder');

const fileLog = debug('file:  ');
const folderLog = debug('folder:');
const matchLog = debug('match: ');

module.exports = (parentFolder, ext) => {
    // TODO: Add ability to pass in folders to exclude from matching.

    // This is the global object that stores the file names and hashes
    // After all promises are resolved this will be returned
    const fileListing = {};

    const processFile = (file, folder) => {
        if (path.extname(file) !== `.${ext}`) {
            matchLog(`File ${file} ${chalk.bgRed.white(' does not match ')} the extension ${ext}.`);
            return new Promise(resolve => resolve());
        }

        return new Promise((resolve, reject) => {
            fs.readFile(path.join(folder, file), (error, data) => {
                if (error) {
                    reject(error);
                }

                const hash = md5(data);

                matchLog(`File ${file} ${chalk.bgGreen.white(' matches ')} the extension ${ext}.`);
                fileListing[folder][file] = hash;

                resolve();
            });
        });
    };

    const processFolder = (folder) => {
        if (isBlacklisted(folder)) {
            // Generate an immediate promise and return it.
            return new Promise(resolve => resolve());
        }

        return new Promise((resolve, reject) => {
            fs.readdir(folder, (error, files) => {
                if (error) {
                    reject(error);
                }

                // TODO: This still creates an empty entry when a folder exists with files
                // that do not have the extension we are looking for.
                if (files.length > 0) {
                    // Set an entry in the array for each new folder.
                    fileListing[folder] = {};
                }

                // Array of processFile or processFolder promises.
                const promisesArray = [];

                files.forEach((item) => {
                    const filePath = path.join(folder, item);
                    const fileStats = fs.statSync(filePath);

                    if (fileStats.isDirectory()) {
                        folderLog(filePath);
                        promisesArray.push(processFolder(filePath));
                    } else {
                        fileLog(filePath);
                        promisesArray.push(processFile(item, folder));
                    }
                });

                Promise.all(promisesArray).then(() => {
                    folderLog(`All items have been processed in ${folder}`);
                    resolve();
                }).catch(promiseError => reject(promiseError));
            });
        });
    };

    return new Promise((resolve, reject) => {
        let folderPath = path.join(process.cwd(), parentFolder);
        let parentStats = null;

        // HACK: If a folder is not passed in, the default path is ./
        // This causes a separator to be appended to the end of the object key
        // which will cause issues with the compare function.
        if (folderPath.lastIndexOf(path.sep) === folderPath.length - 1) {
            folderPath = folderPath.substring(0, folderPath.length - 1);
        }

        // First try to get stats on the parent directory.
        try {
            parentStats = fs.statSync(folderPath);
        } catch (error) {
            reject(new Error('Cannot get stats on the path passed in.'));
        }

        // If it's a directory, kick off all of the promises to inspect the files.
        if (parentStats.isDirectory()) {
            processFolder(folderPath).then(() => {
                resolve(fileListing);
            }).catch((error) => {
                reject(error);
            });
        } else {
            reject(new Error('The parent folder MUST be a directory'));
        }
    });
};
