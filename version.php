<?php
echo max(array_map('filemtime', glob('*.{html,js,css}', GLOB_NOSORT|GLOB_BRACE)));
