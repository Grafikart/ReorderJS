'use strict';

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();
var browserify = require('browserify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var browserSync = require('browser-sync');
var reload = browserSync.reload;

var jsFile = "./src/Sortable.js";
var dist   = "./dist/";

gulp.task('default', function(){
    browserSync({
        notify: false,
        open: true,
        server: './'
    });
    $.watch([jsFile], function(){
        gulp.start('jshint');
    });
    return $.watch([jsFile], reload);
});

gulp.task('jshint', function(){
  return gulp.src(jsFile)
    .pipe($.jshint({browser: true}))
    .pipe($.jshint.reporter('jshint-stylish'))
});

gulp.task('build', function(){
    var b = browserify({
        entries: 'src/browserify.js',
        debug: true
    });

    b.bundle()
        .pipe(source('sortable.js'))
        .pipe(buffer())
        .on('error', $.util.log)
        .pipe(gulp.dest(dist));

    return b.bundle()
        .pipe(source('sortable.min.js'))
        .pipe(buffer())
        .pipe($.uglify())
        .on('error', $.util.log)
        .pipe(gulp.dest(dist));

});