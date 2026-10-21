const React=require("react");const {View}=require("react-native");
function useVideoPlayer(){return{play(){},pause(){},replace(){},release(){}};}
function VideoView(props){return React.createElement(View,props);}
module.exports={useVideoPlayer,VideoView};
