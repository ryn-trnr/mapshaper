// Dynamically get the base URL to ensure file paths work in localhost and also when uploaded to Amplify
const baseURL = window.location.origin; 

mapshaper.manifest = {
  files: [
    `${baseURL}/mapshaper/data/network - links.zip`
  ],
  quick_view: true,
  commands: "-classify field=cycleway save-as=stroke colors='#bdbdbd,#2576b8,#43a340,#ff7f00,#06c7b4,#d62f31,#9848a8'"
};