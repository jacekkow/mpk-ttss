<?php
setlocale(LC_CTYPE, 'pl_PL.UTF-8');

function split_stop_name($string) {
	$string = strtolower(iconv('utf-8', 'ascii//TRANSLIT', $string));
	$words = preg_split('/\\W+/', $string);
	
	foreach($words as &$word) {
		$two = substr($word, 0, 2);
		if($two == 'os') $word = 'os';
		elseif($two == 'al') $word = 'al';
		elseif($two == 'sw') $word = 'sw';
	}
	unset($word);
	
	return array_values($words);
}

function normalize_name($string) {
	return strtr(strtr($string, ['.' => '. ']), ['  ' => ' ']);
}

function normalize_name_cmp($string) {
	return normalize_name(mb_strtolower($string, 'UTF-8'));
}
