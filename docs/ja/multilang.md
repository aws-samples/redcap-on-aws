JP | [EN](../en/multilang.md)

# 多言語対応

[REDCap Consortium Language Library](https://redcap.vanderbilt.edu/plugins/redcap_consortium/language_library.php) から、対応するバージョン、言語の Language File をダウンロードし、解凍してください。解凍後は`.ini`形式となります。

解凍済みの`.ini`ファイルを`packages/REDCap/languages`に配置します。複数言語を利用したい際は、複数配置することが可能です。

この操作を事前に行うことにより、デプロイ後、REDCap の設定画面から言語変更がが可能になります。

**（注意） 言語の設定変更は、REDCap の設定画面からも行うことができますが、必ず上記の方法で設定してください。REDCap の設定で行うと、正しく反映されない場合があります。**
