var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var browserSync = require('browser-sync');
var reload = browserSync.reload;

gulp.task('default', function(){
    browserSync({
        notify: false,
        open: true,
        server: './'
    });
    $.watch(['js/*.js'], function(){
        gulp.start('js');
    });
    return $.watch(['js/*.js', '*/.html', 'css/*.css'], reload);
});

gulp.task('js', function(){
  return gulp.src('./js/sorter.js')
    .pipe($.jshint())
    .pipe($.jshint.reporter('jshint-stylish'));
});