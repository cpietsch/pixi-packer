"use strict";

var crypto = require("crypto");
var fs = require("fs-extra");
var promisify = require("es6-promisify");
var _ = require("underscore");
var path = require("path");
const nextPowerOfTwo = require("next-power-of-two");

module.exports = class Spritesheet {
    constructor(scaledGroup, bin, groupConfig, config, cache, cachePath, imageProcessor) {
        this.bin = bin;
        this.groupConfig = groupConfig;
        this.config = config;
        this.hash = this.calculateHash(scaledGroup);
        this.cache = cache;
        this.cachePath = cachePath;
        this.imageProcessor = imageProcessor;
    }

    getExtension() {
        return this.groupConfig.jpeg ? "jpeg" : "png";
    }

    copyFiles(outputPath) {
        var outputImagePath = path.join(outputPath, this.basename);
        return promisify(fs.copy)(this.cachedImagePath, outputImagePath);
    }

    createImage(cachedImagePath) {
        let width = this.bin.width;
        let height = this.bin.height;

        if (this.groupConfig.force_power_of_two) {
            // width = nextPowerOfTwo(width);
            // height = nextPowerOfTwo(height);
            width = 4 * Math.ceil(width/4);
            height = 4 * Math.ceil(height/4);
            console.log(width, height)
        }
        return this.imageProcessor.combine(
            this.bin.rects,
            width, height,
            cachedImagePath,
            this.groupConfig.jpeg, this.groupConfig.quality,
            this.groupConfig.compressor
        );
    }

    createLoadingInformation(cachedImagePath) {
        return this.bin.rects.map(rect => {
            let scaledSprite = rect.data;
            let sprite = scaledSprite.sprite;
            let result = {
                "name": sprite.name,
                "position": {
                    "x": rect.x,
                    "y": rect.y
                },
                "dimension": {
                    "w": scaledSprite.width,
                    "h": scaledSprite.height
                }
            };

            if (scaledSprite.trim) {
                result.trim = {
                    "x": scaledSprite.trim.x,
                    "y": scaledSprite.trim.y,
                    "w": scaledSprite.trim.width,
                    "h": scaledSprite.trim.height
                };
            }

            return result;
        });
    }

    cacheMiss() {
        let cachedImagePath = this.cache.getCachePath(this.basename);
        return this.createImage(cachedImagePath)
        .then(() => {
            return Promise.all([
                this.createLoadingInformation(cachedImagePath),
                promisify(fs.stat)(cachedImagePath)
            ]);
        })
        .then(results => {
            let loadingInformation = results[0];
            let outputFilesize = results[1].size;
            return {cachedImagePath, loadingInformation, outputFilesize};
        });
    }

    cacheInterpret(data) {
        this.cachedImagePath = data.cachedImagePath;
        this.loadingInformation = data.loadingInformation;
        this.outputFilesize = data.outputFilesize;
    }

    get basename() {
        return this.hash + "." + this.getExtension();
    };

    calculateHash(scaledGroup) {
        var hash = crypto.createHash("sha1");
        hash.update(scaledGroup.groupHash);
        hash.update(this.bin.rects.map(rect => rect.data.path + "_" + rect.x + "_" + rect.y).sort().join(" ") + "_");
        hash.update(this.getExtension() + "_");
        hash.update((this.groupConfig.quality ? this.groupConfig.quality : "noquality") + "_");
        return hash.digest("hex");
    };

    process() {
        return this.cache.lookup("spritesheet", this.hash, this.cacheMiss.bind(this), 3)
        .then(this.cacheInterpret.bind(this))
        .then(() => this);
    };

    copy(outputPath) {
        return this.copyFiles(outputPath);
    };
};