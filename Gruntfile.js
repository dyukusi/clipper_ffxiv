module.exports = function(grunt) {
  grunt.initConfig({
    browserify : {
      index: {
        src : 'src/render_script/index.js',
        dest : 'src/render_script/compressed/index.min.js',
      },
    },

    watch: {
      header : {
        files : ['src/render_script/index.js'],
        tasks : ['browserify:index'],
      },
    },

  });

  // plugins
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-watch');

  // tasks
  // grunt.registerTask('default', ['cssmin', 'br', 'sass']);
  grunt.registerTask('br', ['browserify']);
};
