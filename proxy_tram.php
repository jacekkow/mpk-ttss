<?php
$base_proxy = 'http://www.ttss.krakow.pl/internetservice';
if($_GET['positionType'] ?? NULL === 'RAW') {
	$_GET['positionType'] = 'CORRECTED';
}
require('proxy_common.php');
