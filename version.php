<?php
$files = glob('*.{html,js,css}', GLOB_NOSORT|GLOB_BRACE);

echo json_encode(
	array_combine(
		$files,
		array_map('filemtime', $files)
	)
);
