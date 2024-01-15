[JP](../ja/multilang.md) | EN

# Add multi-language support

You can provide or download language files from [REDCap Consortium Language Library](https://redcap.vanderbilt.edu/plugins/redcap_consortium/language_library.php). These are zip files, so you need to unzip. The language file will be in `.ini` format. Place the unzipped `.ini` file into `packages/redcap/languages`. If you want to use multiple languages, you can place multiple files. Be careful to follow the name convention required by REDCap, e.g `Japanese.ini` for Japanese.

After the initial deployment, if you need to add or remove languages, you need to follow the update process described bellow. (Updating REDCap)
