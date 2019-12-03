import React, {Component} from 'react'

import {
  node,
  func,
  oneOfType,
  string,
  array,
  bool,
  instanceOf
} from 'prop-types'

const cache = {}
const imgPropTypes = {
  loader: node,
  unloader: node,
  decode: bool,
  crossorigin: string,
  src: oneOfType([string, array]),
  container: func,
  loaderContainer: func,
  unloaderContainer: func
}

if (process.env.NODE_ENV != 'production' && process.env.NODE_ENV != 'test') {
  imgPropTypes.containermockImage = instanceOf(Image) //used for testing only
}

class Img extends Component {
  static propTypes = imgPropTypes

  static defaultProps = {
    loader: false,
    unloader: false,
    decode: true,
    src: [],
    localforage: undefined,
    // by default, just return what gets sent in. Can be used for advanced rendering
    // such as animations
    container: x => x
  }

  constructor(props) {
    super(props)

    // default loader/unloader container to just container. If no container was set
    // this will be a noop
    this.loaderContainer = props.loaderContainer || props.container
    this.unloaderContainer = props.unloaderContainer || props.container

    this.sourceList = this.srcToArray(this.props.src)

    // check cache to decide at which index to start
    for (let i = 0; i < this.sourceList.length; i++) {
      // if we've never seen this image before, the cache wont help.
      // no need to look further, just start loading
      /* istanbul ignore else */
      if (!(this.sourceList[i] in cache)) break

      // if we have loaded this image before, just load it again
      /* istanbul ignore else */
      if (cache[this.sourceList[i]] === true) {
        this.state = {currentIndex: i, isLoading: false, isLoaded: true}
        return
      }
    }

    this.state = this.sourceList.length
      ? // 'normal' opperation: start at 0 and try to load
        {currentIndex: 0, isLoading: true, isLoaded: false}
      : // if we dont have any sources, jump directly to unloaded
        {isLoading: false, isLoaded: false}
  }

  getBase64Image = (img) => {
    var canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    return canvas.toDataURL("image/png");
  }

  srcToArray = src => (Array.isArray(src) ? src : [src]).filter(x => x)

  onLoad = () => {
    cache[this.sourceList[this.state.currentIndex]] = true

    /* istanbul ignore else */
    if (this.i){
      if (this.i.src === this.sourceList[this.state.currentIndex] && this.props.localforage !== undefined){
        this.props.localforage.setItem(this.sourceList[this.state.currentIndex], this.getBase64Image(this.i));
      }

      this.setState({isLoaded: true})
    } 
  }

  onError = () => {
    cache[this.sourceList[this.state.currentIndex]] = false
    // if the current image has already been destroyed, we are probably no longer mounted
    // no need to do anything then
    /* istanbul ignore else */
    if (!this.i) return false

    // before loading the next image, check to see if it was ever loaded in the past
    for (
      var nextIndex = this.state.currentIndex + 1;
      nextIndex < this.sourceList.length;
      nextIndex++
    ) {
      // get next img
      let src = this.sourceList[nextIndex]

      // if we have never seen it, its the one we want to try next
      if (!(src in cache)) {
        this.setState({currentIndex: nextIndex})
        break
      }

      // if we know it exists, use it!
      if (cache[src] === true) {
        this.setState({
          currentIndex: nextIndex,
          isLoading: false,
          isLoaded: true
        })
        return true
      }

      // if we know it doesn't exist, skip it!
      /* istanbul ignore else */
      if (cache[src] === false) continue
    }

    // currentIndex is zero bases, length is 1 based.
    // if we have no more sources to try, return - we are done
    if (nextIndex === this.sourceList.length)
      return this.setState({isLoading: false})

    // otherwise, try the next img
    this.loadImg()
  }

  loadImg = async () => {
    const { localforage } = this.props;

    if (process.env.NODE_ENV != 'production') {
      this.i = this.props.mockImage || new Image()
    } else {
      this.i = new Image()
    }

    if (localforage !== undefined){
      const base64Image = await localforage.getItem(this.sourceList[this.state.currentIndex]);
      if (base64Image){
        this.i.src = base64Image;
      }
      else{
        this.i.src = this.sourceList[this.state.currentIndex]
      }
    }
    else{
      this.i.src = this.sourceList[this.state.currentIndex]
    }

    if (this.props.crossorigin) {
      this.i.crossOrigin = this.props.crossorigin
    }

    if (this.props.decode && this.i.decode) {
      try{
        await this.i.decode()
        this.onLoad();
      }
      catch(reason){
        this.onError(reason)
      }
    } else {
      this.i.onload = this.onLoad
      this.i.onerror = this.onError
    }
  }

  unloadImg = () => {
    this.i.onerror = null
    this.i.onload = null

    // abort any current downloads https://github.com/mbrevda/react-image/pull/223
    this.i.src = ''

    try {
      delete this.i.src
    } catch (e) {
      // On Safari in Strict mode this will throw an exception,
      //  - https://github.com/mbrevda/react-image/issues/187
      // We don't need to do anything about it.
    }
    delete this.i
  }

  componentDidMount() {
    // kick off process
    /* istanbul ignore else */
    if (this.state.isLoading) this.loadImg()
  }

  componentWillUnmount() {
    // ensure that we dont leave any lingering listeners
    /* istanbul ignore else */
    if (this.i) this.unloadImg()
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    this.loaderContainer = nextProps.loaderContainer || nextProps.container
    this.unloaderContainer = nextProps.unloaderContainer || nextProps.container

    let src = this.srcToArray(nextProps.src)

    let srcAdded = src.filter(s => this.sourceList.indexOf(s) === -1)
    let srcRemoved = this.sourceList.filter(s => src.indexOf(s) === -1)

    // if src prop changed, restart the loading process
    if (srcAdded.length || srcRemoved.length) {
      this.sourceList = src

      // if we dont have any sources, jump directly to unloader
      if (!src.length) return this.setState({isLoading: false, isLoaded: false})
      this.setState(
        {currentIndex: 0, isLoading: true, isLoaded: false},
        this.loadImg
      )
    }
  }

  render() {
    // set img props as rest
    const {
      container,
      loader,
      unloader,

      // props to exclude from the rest property
      src,
      decode,
      loaderContainer,
      unloaderContainer,
      mockImage,
      localforage,

      ...rest
    } = this.props //eslint-disable-line

    // if we have loaded, show img
    if (this.state.isLoaded) {
      let src = this.sourceList[this.state.currentIndex];
      if (this.props.localforage !== undefined){
        const base64Img = this.props.localforage.getItem(this.sourceList[this.state.currentIndex]);
        if(base64Img !== undefined){
          src = base64Img;
        }
      }

      const imgProps = {
        ...{src: src},
        ...rest
      }

      return container(<img {...imgProps} />)
    }

    // if we are still trying to load, show img and a loader if requested
    if (!this.state.isLoaded && this.state.isLoading) {
      return loader ? this.loaderContainer(loader) : null
    }

    // if we have given up on loading, show a place holder if requested, or nothing
    /* istanbul ignore else */
    if (!this.state.isLoaded && !this.state.isLoading) {
      return unloader ? this.unloaderContainer(unloader) : null
    }
  }
}

export default Img
